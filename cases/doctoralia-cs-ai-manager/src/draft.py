"""
Draft composer + confidence model.

Two layers, on purpose:

  1. A deterministic composer builds the message from the doctor's own facts.
     It always runs, needs no API key, and is the version we are accountable for.
  2. If ANTHROPIC_API_KEY is set, an LLM rewrites that draft for tone only —
     it is given the facts and forbidden to add any. If the call fails, or if
     it introduces a number that was not in the facts, we fall back to layer 1.

The model is never the source of a fact. That is the whole design.

Languages: messages to doctors are Spanish (usted), always. Everything the
specialist reads about a play (why, ask, briefs, notes) exists in English and
Spanish; compose() returns the English keys for Streamlit and an `i18n` block
of L(en, es) for the web.
"""
from __future__ import annotations
import os, re
import pandas as pd

from i18n import L, en, pct
from pipeline import RULES, LIFT, BASELINE_CHURN

CONFIDENCE_FLOOR = 0.55

MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def next_business_day(asof) -> str:
    """The first weekday after `asof`, as a doctor reads it: "el lunes 28 de septiembre".
    Holidays are not modelled."""
    d = pd.Timestamp(asof) + pd.Timedelta(days=1)
    while d.weekday() >= 5:
        d += pd.Timedelta(days=1)
    return f"el {DAYS_ES[d.weekday()]} {d.day} de {MONTHS_ES[d.month - 1]}"


def _c(key: str, digits: int = 0) -> str:
    """Churn rate of a signal, quoted from pipeline.LIFT."""
    return pct(LIFT[key][1], digits)


# --- what each play is, when it fires, and what we ask the doctor for --------
# Order is the priority order. The first play whose condition holds is the one we
# run, so the biggest lever sits at the top. Reorder this list to change what the
# whole team works on first.
#
# `mode` decides what comes out:
#   "draft"  — a message the specialist can send as is
#   "brief"  — NOT a message. A call brief. Used where a WhatsApp would do harm.
#   "handoff"— not farming's work at all; route it and move on.
#
# Text for the specialist comes in pairs: why/why_es, ask/ask_es, brief/brief_es.
# `es` is the message to the doctor and has no English twin on purpose. All of
# them may use any field from fmt().
PLAYS = [
    dict(
        key="churn_threat", mode="brief",
        when=lambda r: bool(r.sig_churn_threat),
        why=f"The doctor has said out loud they may cancel or are comparing platforms. "
            f"{_c('churn_threat')} of these churn against {pct(BASELINE_CHURN, 1)} baseline "
            "— the strongest signal in the data.",
        why_es=f"El doctor dijo que podría cancelar o que está comparando plataformas. "
               f"El {_c('churn_threat')} de estos se van, contra {pct(BASELINE_CHURN, 1)} de base: "
               "la señal más fuerte en los datos.",
        ask="get them on a call today, with their own numbers in front of you",
        ask_es="llamarle hoy, con sus propios números a la mano",
        brief=("DO NOT send a WhatsApp. A templated message to a doctor who just threatened to "
               "leave reads as exactly what it is.\n\n"
               "Call today. Before you dial, have these three things:\n"
               "  1. Their bookings: {last} last month, {avg:.0f} on average. "
               "Median for {specialty} in {city} is {peer:.0f}.\n"
               "  2. What they actually said, on {when}: “{note}”\n"
               "  3. One thing you will change this week, named, with a date.\n\n"
               "Do not promise more patients. Promise the specific fix and a follow-up date."),
        brief_es=("NO mandes WhatsApp. Un mensaje de plantilla a un doctor que acaba de decir que "
                  "se va se lee exactamente como lo que es.\n\n"
                  "Llama hoy. Antes de marcar, ten a la mano estas tres cosas:\n"
                  "  1. Sus citas: {last} el mes pasado, {avg:.0f} en promedio. "
                  "La mediana de {specialty} en {city} es {peer:.0f}.\n"
                  "  2. Lo que dijo, el {when_es}: “{note}”\n"
                  "  3. Una cosa que vas a cambiar esta semana, con nombre y fecha.\n\n"
                  "No prometas más pacientes. Promete el arreglo concreto y una fecha de "
                  "seguimiento."),
    ),
    dict(
        key="discouraged", mode="brief",
        when=lambda r: bool(r.sig_discouraged) and not bool(r.sig_churn_threat),
        why=f"Noted as discouraged with results. {_c('discouraged')} of these churn, "
            f"{LIFT['discouraged'][2]:.2f}× the baseline. A cheerful message to someone who "
            "told us they are disappointed reads as not having listened.",
        why_es=f"Anotado como desanimado con los resultados. El {_c('discouraged')} de estos se "
               f"van, {LIFT['discouraged'][2]:.2f}× la base. Un mensaje animoso a alguien que "
               "nos dijo que está decepcionado se lee como que no lo escuchamos.",
        ask="call, show one piece of real progress, and set a date to check in",
        ask_es="llamarle, mostrarle un avance real y fijar fecha para revisar",
        brief=("DO NOT send a cheerful message. They told us they are discouraged; a template "
               "that says everything is going well proves we did not listen.\n\n"
               "Call. Before you dial, have these three things:\n"
               "  1. Their bookings against their peers: {avg:.0f} a month on average, {last} "
               "last month. Median for {specialty} in {city} is {peer:.0f}.\n"
               "  2. What they said, on {when}: “{note}”\n"
               "  3. One piece of visible progress from their record: {progress}.\n\n"
               "Close with a date for the next check-in, and write it in the note."),
        brief_es=("NO mandes un mensaje animoso. Nos dijo que está desanimado; una plantilla "
                  "que dice que todo va bien demuestra que no lo escuchamos.\n\n"
                  "Llama. Antes de marcar, ten a la mano estas tres cosas:\n"
                  "  1. Sus citas frente a sus pares: {avg:.0f} al mes en promedio, {last} el mes "
                  "pasado. La mediana de {specialty} en {city} es {peer:.0f}.\n"
                  "  2. Lo que dijo, el {when_es}: “{note}”\n"
                  "  3. Un avance visible en su cuenta: {progress_es}.\n\n"
                  "Cierra con una fecha para la siguiente revisión y anótala en la nota."),
    ),
    dict(
        key="open_commitment", mode="draft",
        when=lambda r: bool(r.commitment_open) and pd.notna(r.open_ask)
                       and (r.days_commitment_open or 0) >= 7,
        why="The doctor committed to something and nothing has moved since. Following up on "
            "their own words converts far better than a fresh ask.",
        why_es="El doctor se comprometió a algo y nada se ha movido desde entonces. Retomar "
               "sus propias palabras funciona mucho mejor que pedir algo nuevo.",
        ask="close the thing they already agreed to do",
        ask_es="cerrar lo que ya aceptó hacer",
        es="Doctor {name}, retomo lo que quedó pendiente: {ask}. "
           "Lo hablamos hace {days} días y sé que la consulta no da tregua. "
           "Si quiere, lo hacemos juntos en 5 minutos y se lo dejo listo — "
           "dígame si le sirve {slot_day} y yo me encargo.",
    ),
    dict(
        key="hollow_calendar", mode="draft",
        when=lambda r: bool(r.calendar_enabled)
                       and r.weekly_slots_published < RULES["calendar_healthy_slots"],
        why="Calendar on, almost nothing bookable. Doctors under {healthy} slots average "
            "{slots_low:.1f} bookings/month against {slots_ok:.1f} for doctors publishing "
            "{healthy}+. Campaign 4 already counts them as converted.",
        why_es="Agenda encendida y casi nada reservable. Los doctores con menos de {healthy} "
               "horarios promedian {slots_low:.1f} citas al mes, contra {slots_ok:.1f} de los que "
               "publican {healthy} o más. La campaña 4 ya los cuenta como convertidos.",
        ask="publish at least {healthy} weekly slots",
        ask_es="publicar al menos {healthy} horarios a la semana",
        es="Doctor {name}, veo que ya activó su agenda en línea — muy bien. "
           "Ahora mismo tiene {slots} {slot_word} publicado{plural}, y los pacientes solo pueden "
           "reservar en los horarios que usted abre. {gain_sentence}"
           "¿Le ayudo a dejar su semana cargada en 5 minutos, hoy o {slot_day}?",
    ),
    dict(
        key="complaint_no_patients", mode="draft",
        when=lambda r: r.complaints >= 1 and bool(r.bottom_quartile),
        why="They have complained about patient volume and they are in fact in the bottom "
            "quartile of their specialty and city. The complaint is correct.",
        why_es="Se quejó del volumen de pacientes y, en efecto, está en el cuartil "
               "inferior de su especialidad y ciudad. La queja es correcta.",
        ask="acknowledge the number, then name one fix",
        ask_es="reconocer el número y luego nombrar un arreglo",
        es="Doctor {name}, tiene razón en lo que nos comentó: está recibiendo "
           "{avg:.0f} citas al mes y el promedio de {specialty} en {city} es {peer:.0f}. "
           "No le voy a decir que es normal. Revisé su perfil y encontré dónde "
           "está la diferencia. ¿Tiene 15 minutos {slot_day} para que se lo muestre?",
    ),
    dict(
        key="visibility", mode="draft",
        when=lambda r: bool(r.demand_constrained),
        why="They have plenty of availability and it is not filling. Doctors in this state run at "
            "0.7 bookings per published slot against 8.0 for doctors whose agenda is genuinely "
            "saturated. More slots will not help; being found will. Telling them to publish more "
            "is the advice campaign 4 gives, and it is wrong for this group.",
        why_es="Tiene disponibilidad de sobra y no se llena. Los doctores en esta situación "
               "llenan 0.7 citas por horario publicado, contra 8.0 de los que tienen la agenda "
               "realmente saturada. Más horarios no ayudan; que lo encuentren, sí. "
               "Pedirle que publique más es lo que hace la campaña 4, y para este grupo "
               "está mal.",
        ask="book a profile and positioning review, not an agenda change",
        ask_es="agendar una revisión de perfil y posicionamiento, no un cambio de agenda",
        es="Doctor {name}, revisé su cuenta y quiero ser directo: su agenda no es el problema. "
           "Tiene {slots} horarios abiertos a la semana y se están reservando alrededor de "
           "{avg:.0f} citas al mes, cuando el promedio de {specialty} en {city} es {peer:.0f}. "
           "Disponibilidad le sobra — lo que falta es que los pacientes lo encuentren. "
           "Eso se trabaja en el perfil y en cómo aparece en las búsquedas. "
           "¿Le parece si lo revisamos juntos {slot_day}?",
    ),
    dict(
        key="calendar_off", mode="draft",
        when=lambda r: not bool(r.calendar_enabled),
        why=f"Online calendar never turned on. {_c('calendar_off', 1)} churn against 5.3%.",
        why_es=f"Nunca activó la agenda en línea. {_c('calendar_off', 1)} se van, "
               "contra 5.3%.",
        ask="turn the calendar on and publish slots in the same session",
        ask_es="activar la agenda y publicar horarios en la misma sesión",
        es="Doctor {name}, su perfil está recibiendo visitas pero todavía no tiene la "
           "agenda en línea activa, así que cada paciente tiene que llamar para reservar. "
           "Le propongo algo concreto: la activamos juntos y dejamos sus horarios de la "
           "semana publicados en la misma llamada — son 10 minutos. ¿Le funciona {slot_day}?",
    ),
    dict(
        key="grade_d_recovery", mode="draft",
        when=lambda r: r.onboarding_grade == "D",
        why=f"Closed onboarding at grade D. {_c('grade_D', 1)} churn against 2.2% for A.",
        why_es=f"Cerró el onboarding en grado D. {_c('grade_D', 1)} se van, contra 2.2% "
               "de los A.",
        ask="complete the setup step left open at onboarding",
        ask_es="completar el paso de configuración que quedó abierto en el onboarding",
        es="Doctor {name}, su cuenta quedó activa pero la configuración se cerró a medias "
           "cuando terminó el alta. Eso explica que todavía no vea resultados. "
           "No hay que empezar de cero: son dos o tres pasos. "
           "¿Le llamo {slot_day} y lo dejamos terminado?",
    ),
    dict(
        key="upsell_lead", mode="handoff",
        when=lambda r: isinstance(r.upsell_signal, str) and len(r.upsell_signal) > 0,
        why="The doctor asked about another product. Farming does not sell it and should not try.",
        why_es="El doctor preguntó por otro producto. Farming no lo vende y no debería "
               "intentarlo.",
        ask="route to the upsell team with the quote, do not pitch it yourself",
        ask_es="derivar al equipo de upsell con la cita textual; no lo ofrezcas tú",
        brief=("Not a farming action. This doctor raised: {upsell}.\n\n"
               "Their own words, {upsell_when}: “{upsell_note}”\n\n"
               "Pass it to the additional-products team with that quote attached. "
               "Pitching it yourself costs you the relationship and them the commission."),
        brief_es=("No es una acción de farming. Este doctor mencionó: {upsell}.\n\n"
                  "Sus palabras, el {upsell_when_es}: “{upsell_note}”\n\n"
                  "Pásalo al equipo de productos adicionales con esa cita. Si lo ofreces "
                  "tú, te cuesta la relación y a ellos la comisión."),
    ),
    dict(
        key="gone_quiet", mode="draft",
        when=lambda r: pd.notna(r.days_since_contact)
                       and r.days_since_contact > RULES["stale_contact_days"]
                       and r.campaigns_enrolled > 0 and r.campaigns_engaged == 0,
        why="Ignored every campaign and no contact in over {stale} days. Automation has already "
            "failed here; a person is the next step, not another campaign.",
        why_es="Ignoró todas las campañas y no hay contacto en más de {stale} "
               "días. La automatización ya falló aquí; lo siguiente es una "
               "persona, no otra campaña.",
        ask="get a reply through any channel",
        ask_es="conseguir una respuesta por cualquier canal",
        es="Doctor {name}, le hemos escrito un par de veces por WhatsApp y no quiero seguir "
           "insistiendo por aquí si no es el mejor canal para usted. "
           "Soy {specialist}, de Doctoralia, y llevo su cuenta. "
           "¿Prefiere que le llame? Dígame el día y la hora y yo marco.",
    ),
]

NOTHING = L("Nothing in this account is off. No campaign, no message. The cheapest correct "
            "action is to leave it alone and spend the hour on the accounts above it.",
            "En esta cuenta no hay nada fuera de lugar. Ni campaña ni mensaje. Lo más "
            "barato y correcto es dejarla en paz y dedicar la hora a las cuentas de arriba.")


def pick_play(r) -> dict | None:
    for p in PLAYS:
        try:
            if p["when"](r):
                return p
        except Exception:
            continue
    return None


# --- confidence -------------------------------------------------------------
def confidence_i18n(r) -> tuple[float, list[dict]]:
    """Evidence completeness, not model certainty. Each missing input costs
    something specific, and the specialist sees exactly what is missing."""
    score, gaps = 1.0, []

    def gap(cost, en_, es_):
        nonlocal score
        score -= cost
        gaps.append(L(en_, es_))

    if pd.isna(r.onboarding_grade):
        gap(0.30, "no onboarding record — we do not know how this account started",
            "sin registro de onboarding: no sabemos cómo empezó esta cuenta")
    if pd.isna(r.bookings_last):
        gap(0.25, "no complete booking month yet — any trend claim would be invented",
            "todavía no hay un mes completo de citas: cualquier tendencia sería inventada")
    elif pd.isna(r.bookings_prev):
        gap(0.15, "only one booking month — cannot call a trend",
            "solo hay un mes de citas: no se puede hablar de tendencia")
    if r.contacts_total == 0:
        gap(0.20, "no contact history — no idea what has already been tried",
            "sin historial de contacto: no sabemos qué se ha intentado")
    if pd.isna(r.days_since_contact):
        gap(0.10, "last contact date unknown", "fecha del último contacto desconocida")
    if r.status == "churned":
        gap(0.50, "doctor already cancelled — this is a churn case, not a farming case",
            "el doctor ya canceló: es un caso de churn, no de farming")
    return max(round(score, 2), 0.0), gaps


def confidence(r) -> tuple[float, list[str]]:
    score, gaps = confidence_i18n(r)
    return score, [g["en"] for g in gaps]


# --- composition ------------------------------------------------------------
def short_name(full: str) -> str:
    return re.sub(r"^(Dr\.|Dra\.)\s*", "", str(full)).split()[-1] if pd.notna(full) else ""


def _ts(v):
    """Dates arrive as Timestamps from the pipeline and as ISO strings from the
    bundle. Both are valid callers, so accept both rather than making one of them
    convert on the way in."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    try:
        return pd.Timestamp(v)
    except Exception:
        return None


def _day(v) -> str:
    t = _ts(v)
    if t is None:
        return v[:10] if isinstance(v, str) else ""
    return t.strftime("%d %b")


def _day_es(v) -> str:
    t = _ts(v)
    if t is None:
        return v[:10] if isinstance(v, str) else ""
    return f"{t.day} de {MONTHS_ES[t.month - 1]}"


def _progress(r) -> tuple[str, str]:
    """One piece of visible progress from the record, for the discouraged brief.
    The workbook has no reviews, so it comes from bookings and the calendar."""
    last, prev = r.bookings_last, r.bookings_prev
    slots = int(r.weekly_slots_published) if pd.notna(r.weekly_slots_published) else 0
    if pd.notna(last) and pd.notna(prev) and last > prev:
        return (f"bookings up from {int(prev)} to {int(last)} last month",
                f"sus citas subieron de {int(prev)} a {int(last)} el mes pasado")
    if bool(r.calendar_enabled) and slots > 0:
        return (f"online calendar on, with {slots} weekly slots published",
                f"agenda en línea activa, con {slots} "
                f"{'horario publicado' if slots == 1 else 'horarios publicados'} a la semana")
    if bool(r.calendar_enabled):
        return ("online calendar is on; publishing slots is the next visible step",
                "la agenda en línea ya está activa; publicar horarios es el siguiente "
                "paso visible")
    return ("nothing yet — the progress to show is the fix you agree on today",
            "todavía nada: el avance a mostrar es el arreglo que acuerden hoy")


def fmt(r) -> dict:
    """Every value a play template may reference. One place, so a template can never
    pull a field that does not exist."""
    n = lambda v, d=0: (int(v) if pd.notna(v) else d)
    healthy = RULES["calendar_healthy_slots"]
    low, ok = getattr(r, "slots_low_avg", None), getattr(r, "slots_ok_avg", None)
    low = float(low) if low is not None and pd.notna(low) else float("nan")
    ok = float(ok) if ok is not None and pd.notna(ok) else float("nan")
    gain = round(ok - low) if pd.notna(low) and pd.notna(ok) else 0
    progress, progress_es = _progress(r)
    return dict(
        name=short_name(r.doctor_name),
        specialty=str(r.specialty).lower(),
        city=r.city,
        slots=n(r.weekly_slots_published),
        slot_word="horario" if n(r.weekly_slots_published) == 1 else "horarios",
        plural="" if n(r.weekly_slots_published) == 1 else "s",
        last=n(r.bookings_last) if pd.notna(r.bookings_last) else "—",
        prev=n(r.bookings_prev) if pd.notna(r.bookings_prev) else "—",
        avg=r.bookings_avg if pd.notna(r.bookings_avg) else 0,
        peer=r.median_specialty_city if pd.notna(r.median_specialty_city) else 0,
        days=n(r.days_commitment_open),
        ask=r.open_ask if pd.notna(r.open_ask) else "lo que quedó pendiente",
        note=str(r.top_signal_note)[:160] if pd.notna(r.top_signal_note) else "",
        when=_day(r.top_signal_at),
        when_es=_day_es(r.top_signal_at),
        upsell=r.upsell_signal if isinstance(r.upsell_signal, str) else "",
        upsell_note=str(r.upsell_note)[:160] if pd.notna(getattr(r, "upsell_note", None)) else "",
        upsell_when=_day(getattr(r, "upsell_at", None)),
        upsell_when_es=_day_es(getattr(r, "upsell_at", None)),
        healthy=healthy,
        stale=RULES["stale_contact_days"],
        slots_low=low, slots_ok=ok,
        # Only said when the table for the threshold in force supports it.
        gain_sentence=(f"Los doctores que publican al menos {healthy} horarios a la semana "
                       f"reciben cerca de {gain} citas más al mes. " if gain >= 1 else ""),
        progress=progress, progress_es=progress_es,
    )


def channel_note(r) -> dict | None:
    """Things the specialists already wrote down about how to reach this doctor."""
    en_, es_ = [], []
    if getattr(r, "sig_whatsapp_only", False):
        en_.append("They have asked to be contacted by WhatsApp only — do not call.")
        es_.append("Pidió que lo contacten solo por WhatsApp: no le llames.")
    if getattr(r, "sig_gatekeeper", False):
        en_.append("Their assistant runs the agenda. Address the assistant, not the doctor.")
        es_.append("Su asistente maneja la agenda. Habla con quien le lleva la agenda, no con "
                   "el doctor.")
    if getattr(r, "max_attempts", 0) and r.max_attempts >= 4:
        k = int(r.max_attempts)
        en_.append(f"{k} contact attempts already logged. One more push, then leave it a week.")
        es_.append(f"Ya hay {k} intentos de contacto registrados. Un intento más y luego "
                   "déjalo una semana.")
    return L(" ".join(en_), " ".join(es_)) if en_ else None


def compose(r, specialist_name: str = "su especialista", slot_day: str | None = None) -> dict:
    """The copilot's output for one doctor. English keys for Streamlit, `i18n` for the web.
    `slot_day` defaults to the business day after the extract date."""
    if slot_day is None:
        slot_day = next_business_day(RULES["extract_date"])
    conf, gaps = confidence_i18n(r)
    play = pick_play(r)
    f = fmt(r)
    why = L(play["why"].format(**f), play["why_es"].format(**f)) if play else None
    ask = L(play["ask"].format(**f), play["ask_es"].format(**f)) if play else None
    channel = channel_note(r)

    out = dict(confidence=conf, gaps=[g["en"] for g in gaps], channel=en(channel),
               play=play["key"] if play else None,
               mode=play["mode"] if play else None,
               why=en(why), ask=en(ask),
               draft=None, instead=None, confident=False)
    i18n = dict(why=why, ask=ask, instead=None, channel=channel, gaps=gaps)
    out["i18n"] = i18n

    if play is None:
        i18n["instead"] = NOTHING
        out["instead"] = NOTHING["en"]
        return out

    # A brief or a handoff is a deliberate refusal to draft, not a failure. These
    # fire regardless of confidence: the point is that a message would be wrong.
    if play["mode"] in ("brief", "handoff"):
        i18n["instead"] = L(play["brief"].format(**f), play["brief_es"].format(**f))
        out["instead"] = i18n["instead"]["en"]
        return out

    if conf < CONFIDENCE_FLOOR:
        i18n["instead"] = handover(r, conf, gaps, play, ask)
        out["instead"] = i18n["instead"]["en"]
        return out

    out["confident"] = True
    out["draft"] = play["es"].format(specialist=specialist_name, slot_day=slot_day, **f)
    return out


def handover(r, conf, gaps, play, ask=None) -> dict:
    """What the copilot does instead of drafting when the evidence is thin.
    It never guesses a message. Returns L(en, es)."""
    if r.status == "churned":
        return L("This doctor has already cancelled. Farming does not own this — Churn does. "
                 "Nothing to send; move it off your list.",
                 "Este doctor ya canceló. No le toca a farming, le toca a Churn. No hay nada "
                 "que mandar; sácalo de tu lista.")
    gaps = [g if isinstance(g, dict) else L(g, g) for g in gaps]
    ask = ask or L(play["ask"], play["ask_es"])
    return L("Not drafting. The evidence is too thin to put words in your mouth:\n  · "
             + "\n  · ".join(g["en"] for g in gaps)
             + f"\n\nThe likely play is '{play['key']}' — {ask['en']}. "
             "Open the account, confirm the facts above, and the draft appears.",
             "No redacto. La evidencia es muy poca para ponerte palabras en la boca:\n  · "
             + "\n  · ".join(g["es"] for g in gaps)
             + f"\n\nEl play probable es '{play['key']}': {ask['es']}. "
             "Abre la cuenta, confirma los datos de arriba y aparece el borrador.")


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
