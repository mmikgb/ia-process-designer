"""
The day, per owner: what a farming specialist works on today, in order.

Pure function over the doctor features, the watchlist and PLAYS. Every order and
every cut is decided here, in Python; the web app only shows it. Named dayplan,
not queue: src/ is on sys.path and a local `queue` shadows the standard library.

Blocks, in order. A doctor appears in exactly one, the first that claims them:

  call      brief-mode play and the signal still inside its lead time (act_now)
  followup  a follow-up they scheduled, due today or overdue inside the stale window
  message   a confident draft; ordered by the play's place in PLAYS
  handoff   an upsell lead to route (one click; does not count against capacity)
  later     everything else with work in it, collapsed, each with a reason

    python3 src/dayplan.py     # per-owner sizes, before and after capacity
"""
from __future__ import annotations
import pandas as pd

import draft as D
from i18n import L

BLOCKS = ["call", "followup", "message", "handoff", "later"]
MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _d(t) -> tuple[str, str]:
    """A short date in both languages: ("22 Sep", "22 sep")."""
    t = pd.Timestamp(t)
    return f"{t.day} {MONTHS_EN[t.month - 1]}", f"{t.day} {D.MONTHS_ES[t.month - 1][:3]}"


def _n(v, d=0):
    return int(v) if v is not None and pd.notna(v) else d


# --- the one-line "why today" per block --------------------------------------
def call_reason(w: dict) -> dict:
    e, lead = _n(w.get("days_elapsed")), _n(w.get("lead_median"))
    if w.get("top_signal") == "discouraged":
        return L(f"Noted as discouraged {e} days ago; these usually leave around day {lead}",
                 f"Anotado como desanimado hace {e} días; suelen irse a los {lead}")
    return L(f"Said they may cancel {e} days ago; these usually leave around day {lead}",
             f"Dijo que cancelaría hace {e} días; suelen irse a los {lead}")


FOLLOWUP_WORDS = {
    "review": ("a review", "revisión"),
    "reschedule": ("a new try", "reagendar"),
    "retry": ("a retry", "reintentar"),
    "weekday": ("a follow-up", "seguimiento"),
}


def followup_reason(r, owner: str, names: dict | None = None) -> dict:
    en_d, es_d = _d(r.followup_due_at)
    w_en, w_es = FOLLOWUP_WORDS.get(r.followup_kind, FOLLOWUP_WORDS["weekday"])
    if r.followup_set_by == owner:
        return L(f"You scheduled {w_en} for {en_d}", f"Agendaste {w_es} para el {es_d}")
    who = str((names or {}).get(r.followup_set_by, r.followup_set_by)).split()[0]
    return L(f"{who} scheduled {w_en} for {en_d}", f"{who} agendó {w_es} para el {es_d}")


def play_reason(r, play: str | None) -> dict:
    f = D.fmt(r)
    avg, peer, slots = f"{f['avg']:.0f}", f"{f['peer']:.0f}", f["slots"]
    healthy = f["healthy"]
    if play == "open_commitment":
        return L(f"Agreed to do something {f['days']} days ago; nothing since",
                 f"Quedó de {f['ask']} hace {f['days']} días; nada desde entonces")
    if play == "hollow_calendar":
        return L(f"Calendar on with {slots} slot{'s' if slots != 1 else ''}; "
                 f"publishing {healthy}+ brings more bookings",
                 f"Agenda encendida con {slots} {f['slot_word']}; publicar {healthy}+ le da "
                 "más citas")
    if play == "complaint_no_patients":
        return L(f"Complained about volume, and is right: {avg}/mo vs {peer} median",
                 f"Se quejó de pocas citas y tiene razón: {avg}/mes vs mediana {peer}")
    if play == "visibility":
        return L(f"{slots} open slots, {avg} bookings/mo vs {peer} median: not being found",
                 f"{slots} horarios abiertos, {avg} citas/mes vs mediana {peer}: no lo encuentran")
    if play == "calendar_off":
        return L("Online calendar never turned on", "Nunca activó la agenda en línea")
    if play == "grade_d_recovery":
        return L("Closed onboarding at grade D; setup left half done",
                 "Cerró el onboarding en grado D; la configuración quedó a medias")
    if play == "gone_quiet":
        dsc = _n(getattr(r, "days_since_contact", None))
        return L(f"No contact in {dsc} days and ignored every campaign",
                 f"Sin contacto hace {dsc} días e ignoró todas las campañas")
    if play == "upsell_lead":
        return L(f"Asked about {f['upsell']}", f"Preguntó por {f['upsell']}")
    if play == "churn_threat":
        return L("Said they may cancel", "Dijo que cancelaría")
    if play == "discouraged":
        return L("Noted as discouraged with results", "Anotado como desanimado con los resultados")
    return L("Needs a look", "Revisar la cuenta")


LATER = {
    "past_lead": L("past the usual warning time; they have probably decided",
                   "pasó su tiempo típico de aviso; probablemente ya decidió"),
    "watch": L("weaker signal: keep an eye on it, not a call for today",
               "señal más débil: en observación, no es para llamar hoy"),
    "thin": L("evidence too thin to draft; open the account first",
              "evidencia insuficiente para redactar; revisa la cuenta primero"),
    "capacity": L("beyond today's capacity", "más allá de tu capacidad de hoy"),
}


def _stale_reason(days: int, window: int) -> dict:
    return L(f"follow-up {days} days overdue, past the {window}-day window",
             f"seguimiento vencido hace {days} días, fuera de la ventana de {window}")


# --- flags: the list behind every count ---------------------------------------
def flags(r, rules: dict, asof: pd.Timestamp) -> list[str]:
    """Per active doctor; churned doctors get [] (kpi.team counts active only)."""
    if r.status != "active":
        return []
    out = []
    if r.risk_score >= 0.5: out.append("at_risk")
    if bool(r.sig_churn_threat): out.append("may_cancel")
    if bool(r.sig_discouraged): out.append("discouraged")
    if bool(r.calendar_hollow): out.append("hollow")
    if bool(r.demand_constrained): out.append("not_found")
    if bool(r.commitment_open): out.append("commitment")
    if _followup_live(r, rules, asof): out.append("followup_due")
    if not bool(r.calendar_enabled): out.append("calendar_off")
    if r.onboarding_grade == "D": out.append("grade_d")
    if isinstance(r.upsell_signal, str) and r.upsell_signal: out.append("upsell")
    return out


def _followup_live(r, rules, asof) -> bool:
    due = getattr(r, "followup_due_at", None)
    if due is None or pd.isna(due):
        return False
    late = (asof - pd.Timestamp(due)).days
    return 0 <= late <= rules["followup_stale_days"]


# --- the plan ----------------------------------------------------------------
def build(doc: pd.DataFrame, watchlist: list[dict], rules: dict, asof,
          copilot: dict | None = None, names: dict | None = None) -> dict[str, dict]:
    """owner_id -> queue (see SPEC_Daily_Tool.md §5.1). `copilot` maps doctor_id to a
    draft.compose() result when the caller already has them; otherwise they are composed.
    `names` maps specialist_id to a name, for "Rafael agendó revisión…"."""
    asof = pd.Timestamp(asof)
    cap, quota, stale = (rules["daily_capacity"], rules["daily_followup_quota"],
                         rules["followup_stale_days"])
    order = {p["key"]: i for i, p in enumerate(D.PLAYS)}
    wl = {w["doctor_id"]: w for w in watchlist}
    active = doc[doc.status == "active"]

    per_owner: dict[str, dict[str, list]] = {}
    for _, r in active.iterrows():
        res = (copilot or {}).get(r.doctor_id) or D.compose(r)
        play, mode = res["play"], res["mode"]
        w = wl.get(r.doctor_id)
        item = dict(doctor_id=r.doctor_id, doctor_name=r.doctor_name, specialty=r.specialty,
                    city=r.city, play=play, mode=mode, risk_score=float(r.risk_score),
                    confident=bool(res["confident"]))
        if w:
            item.update(signal_at=w.get("signal_at"), lead_median=w.get("lead_median"),
                        days_of_lead_left=w.get("days_of_lead_left"))
        due = r.followup_due_at if pd.notna(getattr(r, "followup_due_at", None)) else None
        late = (asof - pd.Timestamp(due)).days if due is not None else None
        if due is not None:
            item["due_at"] = str(pd.Timestamp(due).date())
        blocks = per_owner.setdefault(r.owner_specialist_id, {b: [] for b in BLOCKS})
        # sort keys live beside the item and are dropped before writing
        if mode == "brief" and w and w.get("tier") == "act_now":
            item.update(block="call", reason=call_reason(w),
                        _k=(w["days_of_lead_left"], -r.risk_score))
        elif late is not None and 0 <= late <= stale:
            item.update(block="followup", reason=followup_reason(r, r.owner_specialist_id, names),
                        _k=(pd.Timestamp(due), -r.risk_score))
        elif mode == "draft" and res["confident"]:
            item.update(block="message", reason=play_reason(r, play),
                        _k=(order.get(play, 99), -r.risk_score,
                            -(r.bookings_avg if pd.notna(r.bookings_avg) else 0)))
        elif mode == "handoff":
            up = getattr(r, "upsell_at", None)
            item.update(block="handoff", reason=play_reason(r, play),
                        _k=(-(pd.Timestamp(up).value if up is not None and pd.notna(up) else 0),))
        else:
            if mode == "brief":
                why = "past_lead" if (w and w.get("tier") == "overdue") else "watch"
                reason = call_reason(w) if w else play_reason(r, play)
                later = LATER[why]
            elif late is not None and late > stale:
                reason, later = followup_reason(r, r.owner_specialist_id, names), _stale_reason(late, stale)
            elif mode == "draft":
                reason, later = play_reason(r, play), LATER["thin"]
            else:
                continue                    # nothing to do for this doctor
            item.update(block="later", origin=None, reason=reason, later_reason=later,
                        _k=(1, -r.risk_score))
        blocks[item["block"]].append(item)

    out = {}
    for owner, blocks in sorted(per_owner.items()):
        for b in blocks.values():
            b.sort(key=lambda x: x["_k"])
        counts = {b: len(v) for b, v in blocks.items()}
        call, fu, msg = blocks["call"], blocks["followup"], blocks["message"]
        fu_today, fu_over = fu[:quota], fu[quota:]
        room = max(cap - len(call) - len(fu_today), 0)
        msg_today, msg_over = msg[:room], msg[room:]
        # Overflow keeps its place: follow-ups first, then messages in PLAYS order, and
        # comes back on the next day it fits.
        over = [dict(x, block="later", origin=x["block"], later_reason=LATER["capacity"],
                     _k=(0,) + x["_k"]) for x in fu_over + msg_over]
        later = over + blocks["later"]
        items = call + fu_today + msg_today + blocks["handoff"] + later
        for i, x in enumerate(items, 1):
            x["rank"] = i
            x.pop("_k", None)
            if x["block"] != "later":
                x.pop("origin", None)
        out[owner] = {"owner": owner, "asof": str(asof.date()), "capacity": cap,
                      "followup_quota": quota, "counts": counts, "items": items}
    return out


def summary(queues: dict[str, dict]) -> list[dict]:
    """Per owner: sizes before capacity (the argument for the quota) and today's plan."""
    rows = []
    for owner, q in queues.items():
        by = {b: 0 for b in BLOCKS}
        for x in q["items"]:
            by[x["block"]] += 1
        lr = [x for x in q["items"] if x["block"] == "later"]
        rows.append({"owner": owner, **{f"{b}_all": q["counts"][b] for b in BLOCKS},
                     **{f"{b}_today": by[b] for b in BLOCKS[:4]},
                     "later": by["later"],
                     "later_past_lead": sum(x["later_reason"] == LATER["past_lead"] for x in lr),
                     "later_capacity": sum(x["later_reason"] == LATER["capacity"] for x in lr)})
    return rows


if __name__ == "__main__":
    import json
    from pipeline import RULES, OUT
    b = json.loads((OUT / "app_data.json").read_text())
    doc = pd.read_parquet(OUT / "doctor_features.parquet")
    names = {s["specialist_id"]: s["specialist_name"] for s in b["specialists"]}
    q = build(doc, b["predict"]["watchlist"], RULES, RULES["extract_date"], names=names)
    print(pd.DataFrame(summary(q)).to_string(index=False))
