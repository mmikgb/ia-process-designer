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


# (owner EN, owner ES, someone else EN, someone else ES); {who} and {d} are filled in
FOLLOWUP_WORDS = {
    "review": ("You scheduled a review for {d}", "Agendaste revisión para el {d}",
               "{who} scheduled a review for {d}", "{who} agendó revisión para el {d}"),
    "reschedule": ("You rescheduled for {d}", "Reagendaste para el {d}",
                   "{who} rescheduled for {d}", "{who} reagendó para el {d}"),
    "retry": ("You planned a retry for {d}", "Quedaste de reintentar el {d}",
              "{who} planned a retry for {d}", "{who} quedó de reintentar el {d}"),
    "weekday": ("You scheduled a follow-up for {d}", "Agendaste seguimiento para el {d}",
                "{who} scheduled a follow-up for {d}", "{who} agendó seguimiento para el {d}"),
}


def followup_reason(r, owner: str, names: dict | None = None) -> dict:
    en_d, es_d = _d(r.followup_due_at)
    mine_en, mine_es, other_en, other_es = FOLLOWUP_WORDS.get(r.followup_kind,
                                                              FOLLOWUP_WORDS["weekday"])
    if r.followup_set_by == owner:
        return L(mine_en.format(d=en_d), mine_es.format(d=es_d))
    who = str((names or {}).get(r.followup_set_by, r.followup_set_by)).split()[0]
    return L(other_en.format(who=who, d=en_d), other_es.format(who=who, d=es_d))


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
def _due_reason(due) -> dict:
    en_d, es_d = _d(due)
    return L(f"due on {en_d}", f"vence el {es_d}")


def classify(doc: pd.DataFrame, watchlist: list[dict], asof, copilot: dict | None = None,
             names: dict | None = None) -> dict[str, list[dict]]:
    """owner_id -> candidate items. Python decides here, once, which blocks each doctor can
    occupy (`claims`, in priority order), the order inside each block (`ranks`) and the
    reason for each. Capacity, the follow-up quota and the stale window are applied by
    plan(), which the web mirrors so a specialist can change them live."""
    asof = pd.Timestamp(asof)
    order = {p["key"]: i for i, p in enumerate(D.PLAYS)}
    wl = {w["doctor_id"]: w for w in watchlist}
    per_owner: dict[str, list[dict]] = {}
    for _, r in doc[doc.status == "active"].iterrows():
        res = (copilot or {}).get(r.doctor_id) or D.compose(r)
        play, mode = res["play"], res["mode"]
        w = wl.get(r.doctor_id)
        owner = r.owner_specialist_id
        item = dict(doctor_id=r.doctor_id, doctor_name=r.doctor_name, specialty=r.specialty,
                    city=r.city, play=play, mode=mode, risk_score=float(r.risk_score),
                    confident=bool(res["confident"]), claims=[], reasons={}, _k={})
        if w:
            item.update(signal_at=w.get("signal_at"), lead_median=w.get("lead_median"),
                        days_of_lead_left=w.get("days_of_lead_left"))
        due = r.followup_due_at if pd.notna(getattr(r, "followup_due_at", None)) else None

        def claim(block, reason, key):
            item["claims"].append(block)
            item["reasons"][block] = reason
            item["_k"][block] = key

        if mode == "brief" and w and w.get("tier") == "act_now":
            claim("call", call_reason(w), (w["days_of_lead_left"], -r.risk_score))
        if due is not None:
            item["due_at"] = str(pd.Timestamp(due).date())
            claim("followup", followup_reason(r, owner, names), (pd.Timestamp(due), -r.risk_score))
        if mode == "draft" and res["confident"]:
            claim("message", play_reason(r, play),
                  (order.get(play, 99), -r.risk_score,
                   -(r.bookings_avg if pd.notna(r.bookings_avg) else 0)))
        if mode == "handoff":
            up = getattr(r, "upsell_at", None)
            claim("handoff", play_reason(r, play),
                  (-(pd.Timestamp(up).value if up is not None and pd.notna(up) else 0),))
        # what "later" says when nothing above applies
        if mode == "brief" and "call" not in item["claims"]:
            item["later_kind"] = "past_lead" if (w and w.get("tier") == "overdue") else "watch"
            item["reasons"]["later"] = call_reason(w) if w else play_reason(r, play)
        elif mode == "draft" and not res["confident"]:
            item["later_kind"] = "thin"
            item["reasons"]["later"] = play_reason(r, play)
        if not item["claims"] and "later_kind" not in item:
            continue                        # nothing to do for this doctor
        item["_k"]["later"] = (-r.risk_score,)
        per_owner.setdefault(owner, []).append(item)

    for items in per_owner.values():
        for b in BLOCKS:
            ranked = sorted((x for x in items if b in x["_k"]), key=lambda x: x["_k"][b])
            for i, x in enumerate(ranked, 1):
                x.setdefault("ranks", {})[b] = i
        for x in items:
            x.pop("_k")
    return per_owner


def plan(items: list[dict], asof, capacity: int, quota: int, window: int) -> list[dict]:
    """The cut. For each candidate: the first claim that holds today (a follow-up holds when
    it is due and at most `window` days late), then calls in full, follow-ups up to
    `quota`, messages to fill `capacity`, handoffs, and everything else in "later".
    Pure and deterministic: web/lib/dayplan.ts is a line-for-line copy."""
    asof = pd.Timestamp(asof)
    blocks: dict[str, list] = {b: [] for b in BLOCKS}
    for x in items:
        y = {k: v for k, v in x.items() if k not in ("block", "reason", "later_reason", "origin",
                                                      "rank")}
        late = (asof - pd.Timestamp(x["due_at"])).days if x.get("due_at") else None
        held = [c for c in x["claims"] if c != "followup" or (late is not None and 0 <= late <= window)]
        if held:
            y.update(block=held[0], reason=x["reasons"][held[0]])
        else:
            y.update(block="later", origin=None)
            if "later_kind" in x:
                y.update(reason=x["reasons"]["later"], later_reason=LATER[x["later_kind"]])
            elif late is not None and late > window:
                y.update(reason=x["reasons"]["followup"], later_reason=_stale_reason(late, window))
            else:                           # a follow-up that is not due yet
                y.update(reason=x["reasons"]["followup"], later_reason=_due_reason(x["due_at"]))
        blocks[y["block"]].append(y)
    for b, v in blocks.items():
        v.sort(key=lambda y: y["ranks"].get(b, 10**9))
    call, fu, msg = blocks["call"], blocks["followup"], blocks["message"]
    fu_today, fu_over = fu[:quota], fu[quota:]
    room = max(capacity - len(call) - len(fu_today), 0)
    msg_today, msg_over = msg[:room], msg[room:]
    # Overflow keeps its place (follow-ups first, then messages in PLAYS order) and
    # comes back on the next day it fits.
    over = [dict(y, block="later", origin=y["block"], later_reason=LATER["capacity"])
            for y in fu_over + msg_over]
    out = call + fu_today + msg_today + blocks["handoff"] + over + blocks["later"]
    for i, y in enumerate(out, 1):
        y["rank"] = i
    return out


def build(doc: pd.DataFrame, watchlist: list[dict], rules: dict, asof,
          copilot: dict | None = None, names: dict | None = None) -> dict[str, dict]:
    """owner_id -> queue (SPEC §5.1), cut with the RULES defaults. Each item also carries
    `claims`, `ranks` and `reasons` so the web can re-cut with the specialist's own
    capacity, quota and window, and as the app's day moves forward."""
    asof = pd.Timestamp(asof)
    cap, quota, stale = (rules["daily_capacity"], rules["daily_followup_quota"],
                         rules["followup_stale_days"])
    out = {}
    for owner, items in sorted(classify(doc, watchlist, asof, copilot, names).items()):
        planned = plan(items, asof, cap, quota, stale)
        counts = {b: 0 for b in BLOCKS}           # before capacity is applied
        for y in planned:
            counts[y.get("origin") or y["block"]] += 1
        out[owner] = {"owner": owner, "asof": str(asof.date()), "capacity": cap,
                      "followup_quota": quota, "followup_stale_days": stale,
                      "counts": counts, "items": planned}
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
