"""
Draft composer + confidence model.

Two layers, on purpose:

  1. A deterministic composer builds the message from the doctor's own facts.
     It always runs, needs no API key, and is the version we are accountable for.
  2. If ANTHROPIC_API_KEY is set, an LLM rewrites that draft for tone only —
     it is given the facts and forbidden to add any. If the call fails, or if
     it introduces a number that was not in the facts, we fall back to layer 1.

The model is never the source of a fact. That is the whole design.
"""
from __future__ import annotations
import os, re
import pandas as pd

CONFIDENCE_FLOOR = 0.55

# --- what each play is, when it fires, and what we ask the doctor for --------
# Order is the priority order. The first play whose condition holds is the one we
# run, so the biggest lever sits at the top. Reorder this list to change what the
# whole team works on first.
#
# `mode` decides what comes out:
#   "draft"  — a message the specialist can send as is
#   "brief"  — NOT a message. A call brief. Used where a WhatsApp would do harm.
#   "handoff"— not farming's work at all; route it and move on.
PLAYS = [
    dict(
        key="churn_threat", mode="brief",
        when=lambda r: bool(r.sig_churn_threat),
        why="The doctor has said out loud they may cancel or are comparing platforms. "
            "36% of these churn against 6.6% baseline — the strongest signal in the data.",
        ask="get them on a call today, with their own numbers in front of you",
        brief=("DO NOT send a WhatsApp. A templated message to a doctor who just threatened to "
               "leave reads as exactly what it is.\n\n"
               "Call today. Before you dial, have these three things:\n"
               "  1. Their bookings: {last} last month, {avg:.0f} on average. "
               "Median for {specialty} in {city} is {peer:.0f}.\n"
               "  2. What they actually said, on {when}: \u201c{note}\u201d\n"
               "  3. One thing you will change this week, named, with a date.\n\n"
               "Do not promise more patients. Promise the specific fix and a follow-up date."),
    ),
    dict(
        key="open_commitment", mode="draft",
        when=lambda r: bool(r.commitment_open) and pd.notna(r.open_ask)
                       and (r.days_commitment_open or 0) >= 7,
        why="The doctor committed to something and nothing has moved since. Following up on "
            "their own words converts far better than a fresh ask.",
        ask="close the thing they already agreed to do",
        es="Doctor {name}, retomo lo que qued\u00f3 pendiente: {ask}. "
           "Lo hablamos hace {days} d\u00edas y s\u00e9 que la consulta no da tregua. "
           "Si quiere, lo hacemos juntos en 5 minutos y se lo dejo listo \u2014 "
           "d\u00edgame si le sirve {slot_day} y yo me encargo.",
    ),
    dict(
        key="hollow_calendar", mode="draft",
        when=lambda r: bool(r.calendar_enabled) and r.weekly_slots_published < 8,
        why="Calendar on, almost nothing bookable. These average 11.3 bookings/month against "
            "15.3 for doctors publishing 8+ slots. Campaign 4 already counts them as converted.",
        ask="publish at least 8 weekly slots",
        es="Doctor {name}, veo que ya activ\u00f3 su agenda en l\u00ednea \u2014 muy bien. "
           "Ahora mismo tiene {slots} {slot_word} publicado{plural}, y los pacientes solo pueden "
           "reservar en los horarios que usted abre. Los doctores que publican al menos "
           "8 horarios a la semana reciben cerca de 4 citas m\u00e1s al mes. "
           "\u00bfLe ayudo a dejar su semana cargada en 5 minutos, hoy o {slot_day}?",
    ),
    dict(
        key="complaint_no_patients", mode="draft",
        when=lambda r: r.complaints >= 1 and bool(r.bottom_quartile),
        why="They have complained about patient volume and they are in fact in the bottom "
            "quartile of their specialty and city. The complaint is correct.",
        ask="acknowledge the number, then name one fix",
        es="Doctor {name}, tiene raz\u00f3n en lo que nos coment\u00f3: est\u00e1 recibiendo "
           "{avg:.0f} citas al mes y el promedio de {specialty} en {city} es {peer:.0f}. "
           "No le voy a decir que es normal. Revis\u00e9 su perfil y encontr\u00e9 d\u00f3nde "
           "est\u00e1 la diferencia. \u00bfTiene 15 minutos {slot_day} para que se lo muestre?",
    ),
    dict(
        key="visibility", mode="draft",
        when=lambda r: bool(r.demand_constrained),
        why="They have plenty of availability and it is not filling. Doctors in this state run at "
            "0.7 bookings per published slot against 8.0 for doctors whose agenda is genuinely "
            "saturated. More slots will not help; being found will. Telling them to publish more "
            "is the advice campaign 4 gives, and it is wrong for this group.",
        ask="book a profile and positioning review, not an agenda change",
        es="Doctor {name}, revis\u00e9 su cuenta y quiero ser directo: su agenda no es el problema. "
           "Tiene {slots} horarios abiertos a la semana y se est\u00e1n reservando alrededor de "
           "{avg:.0f} citas al mes, cuando el promedio de {specialty} en {city} es {peer:.0f}. "
           "Disponibilidad le sobra \u2014 lo que falta es que los pacientes lo encuentren. "
           "Eso se trabaja en el perfil y en c\u00f3mo aparece en las b\u00fasquedas. "
           "\u00bfLe parece si lo revisamos juntos {slot_day}?",
    ),
    dict(
        key="calendar_off", mode="draft",
        when=lambda r: not bool(r.calendar_enabled),
        why="Online calendar never turned on. 10.6% churn against 5.3%.",
        ask="turn the calendar on and publish slots in the same session",
        es="Doctor {name}, su perfil est\u00e1 recibiendo visitas pero todav\u00eda no tiene la "
           "agenda en l\u00ednea activa, as\u00ed que cada paciente tiene que llamar para reservar. "
           "Le propongo algo concreto: la activamos juntos y dejamos sus horarios de la "
           "semana publicados en la misma llamada \u2014 son 10 minutos. \u00bfLe funciona {slot_day}?",
    ),
    dict(
        key="grade_d_recovery", mode="draft",
        when=lambda r: r.onboarding_grade == "D",
        why="Closed onboarding at grade D. 17.4% churn against 2.2% for A.",
        ask="complete the setup step left open at onboarding",
        es="Doctor {name}, su cuenta qued\u00f3 activa pero la configuraci\u00f3n se cerr\u00f3 a medias "
           "cuando termin\u00f3 el alta. Eso explica que todav\u00eda no vea resultados. "
           "No hay que empezar de cero: son dos o tres pasos. "
           "\u00bfLe llamo {slot_day} y lo dejamos terminado?",
    ),
    dict(
        key="upsell_lead", mode="handoff",
        when=lambda r: isinstance(r.upsell_signal, str) and len(r.upsell_signal) > 0,
        why="The doctor asked about another product. Farming does not sell it and should not try.",
        ask="route to the upsell team with the quote, do not pitch it yourself",
        brief=("Not a farming action. This doctor raised: {upsell}.\n\n"
               "Their own words, {upsell_when}: \u201c{upsell_note}\u201d\n\n"
               "Pass it to the additional-products team with that quote attached. "
               "Pitching it yourself costs you the relationship and them the commission."),
    ),
    dict(
        key="gone_quiet", mode="draft",
        when=lambda r: pd.notna(r.days_since_contact) and r.days_since_contact > 21
                       and r.campaigns_enrolled > 0 and r.campaigns_engaged == 0,
        why="Ignored every campaign and no contact in over three weeks. Automation has already "
            "failed here; a person is the next step, not another campaign.",
        ask="get a reply through any channel",
        es="Doctor {name}, le hemos escrito un par de veces por WhatsApp y no quiero seguir "
           "insistiendo por aqu\u00ed si no es el mejor canal para usted. "
           "Soy {specialist}, de Doctoralia, y llevo su cuenta. "
           "\u00bfPrefiere que le llame? D\u00edgame el d\u00eda y la hora y yo marco.",
    ),
]


def pick_play(r) -> dict | None:
    for p in PLAYS:
        try:
            if p["when"](r):
                return p
        except Exception:
            continue
    return None


# --- confidence -------------------------------------------------------------
def confidence(r) -> tuple[float, list[str]]:
    """Evidence completeness, not model certainty. Each missing input costs
    something specific, and the specialist sees exactly what is missing."""
    score, gaps = 1.0, []
    if pd.isna(r.onboarding_grade):
        score -= 0.30; gaps.append("no onboarding record — we do not know how this account started")
    if pd.isna(r.bookings_last):
        score -= 0.25; gaps.append("no complete booking month yet — any trend claim would be invented")
    elif pd.isna(r.bookings_prev):
        score -= 0.15; gaps.append("only one booking month — cannot call a trend")
    if r.contacts_total == 0:
        score -= 0.20; gaps.append("no contact history — no idea what has already been tried")
    if pd.isna(r.days_since_contact):
        score -= 0.10; gaps.append("last contact date unknown")
    if r.status == "churned":
        score -= 0.50; gaps.append("doctor already cancelled — this is a churn case, not a farming case")
    return max(round(score, 2), 0.0), gaps


# --- composition ------------------------------------------------------------
def short_name(full: str) -> str:
    return re.sub(r"^(Dr\.|Dra\.)\s*", "", str(full)).split()[-1] if pd.notna(full) else ""


def _day(v) -> str:
    """Dates arrive as Timestamps from the pipeline and as ISO strings from the
    bundle. Both are valid callers, so accept both rather than making one of them
    convert on the way in."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return ""
    if isinstance(v, str):
        try:
            return pd.Timestamp(v).strftime("%d %b")
        except Exception:
            return v[:10]
    return v.strftime("%d %b")


def fmt(r) -> dict:
    """Every value a play template may reference. One place, so a template can never
    pull a field that does not exist."""
    import numpy as np
    n = lambda v, d=0: (int(v) if pd.notna(v) else d)
    return dict(
        name=short_name(r.doctor_name),
        specialty=str(r.specialty).lower(),
        city=r.city,
        slots=n(r.weekly_slots_published),
        slot_word="horario" if n(r.weekly_slots_published) == 1 else "horarios",
        plural="" if n(r.weekly_slots_published) == 1 else "s",
        last=n(r.bookings_last) if pd.notna(r.bookings_last) else "\u2014",
        prev=n(r.bookings_prev) if pd.notna(r.bookings_prev) else "\u2014",
        avg=r.bookings_avg if pd.notna(r.bookings_avg) else 0,
        peer=r.median_specialty_city if pd.notna(r.median_specialty_city) else 0,
        days=n(r.days_commitment_open),
        ask=r.open_ask if pd.notna(r.open_ask) else "lo que qued\u00f3 pendiente",
        note=str(r.top_signal_note)[:160] if pd.notna(r.top_signal_note) else "",
        when=_day(r.top_signal_at),
        upsell=r.upsell_signal if isinstance(r.upsell_signal, str) else "",
        upsell_note=str(r.upsell_note)[:160] if pd.notna(getattr(r, "upsell_note", None)) else "",
        upsell_when=_day(getattr(r, "upsell_at", None)),
    )


def channel_note(r) -> str | None:
    """Things the specialists already wrote down about how to reach this doctor."""
    bits = []
    if getattr(r, "sig_whatsapp_only", False):
        bits.append("They have asked to be contacted by WhatsApp only \u2014 do not call.")
    if getattr(r, "sig_gatekeeper", False):
        bits.append("Their assistant runs the agenda. Address the assistant, not the doctor.")
    if getattr(r, "max_attempts", 0) and r.max_attempts >= 4:
        bits.append(f"{int(r.max_attempts)} contact attempts already logged. "
                    "One more push, then leave it a week.")
    return " ".join(bits) or None


def compose(r, specialist_name: str = "su especialista", slot_day: str = "ma\u00f1ana") -> dict:
    conf, gaps = confidence(r)
    play = pick_play(r)

    out = dict(confidence=conf, gaps=gaps, channel=channel_note(r),
               play=play["key"] if play else None,
               mode=play["mode"] if play else None,
               why=play["why"] if play else None,
               ask=play["ask"] if play else None,
               draft=None, instead=None, confident=False)

    if play is None:
        out["instead"] = ("Nothing in this account is off. No campaign, no message. The cheapest "
                          "correct action is to leave it alone and spend the hour on the accounts "
                          "above it.")
        return out

    f = fmt(r)

    # A brief or a handoff is a deliberate refusal to draft, not a failure. These
    # fire regardless of confidence: the point is that a message would be wrong.
    if play["mode"] in ("brief", "handoff"):
        out["instead"] = play["brief"].format(**f)
        return out

    if conf < CONFIDENCE_FLOOR:
        out["instead"] = handover(r, conf, gaps, play)
        return out

    out["confident"] = True
    out["draft"] = play["es"].format(specialist=specialist_name, slot_day=slot_day, **f)
    return out


def handover(r, conf, gaps, play) -> str:
    """What the copilot does instead of drafting when the evidence is thin.
    It never guesses a message."""
    if r.status == "churned":
        return ("This doctor has already cancelled. Farming does not own this \u2014 Churn does. "
                "Nothing to send; move it off your list.")
    return ("Not drafting. The evidence is too thin to put words in your mouth:\n  \u00b7 "
            + "\n  \u00b7 ".join(gaps)
            + f"\n\nThe likely play is '{play['key']}' \u2014 {play['ask']}. "
            "Open the account, confirm the facts above, and the draft appears.")


# --- optional LLM polish ----------------------------------------------------
NUM = re.compile(r"\d+")

def polish(draft: str, facts: dict) -> tuple[str, str]:
    """Tone only. Returns (text, source). Any new number = rejected."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not draft:
        return draft, "deterministic"
    try:
        import anthropic
        from llm import MODEL_FAST
        c = anthropic.Anthropic(api_key=key)
        m = c.messages.create(
            model=MODEL_FAST, max_tokens=400,
            system=("Eres un especialista de Customer Success de Doctoralia México escribiendo "
                    "por WhatsApp a un doctor. Reescribe el mensaje para que suene natural y "
                    "cercano, de usted, máximo 60 palabras. REGLAS: no inventes ningún dato ni "
                    "número que no esté en el mensaje original. No agregues promesas. "
                    "Devuelve solo el mensaje."),
            messages=[{"role": "user", "content": draft}],
        )
        out = "".join(b.text for b in m.content if b.type == "text").strip()
        if not out:
            return draft, "deterministic (llm returned no text)"
        if set(NUM.findall(out)) - set(NUM.findall(draft)):
            return draft, "deterministic (llm added a number that was not in the facts)"
        return out, "llm-polished"
    except Exception as e:
        return draft, f"deterministic (llm unavailable: {type(e).__name__})"
