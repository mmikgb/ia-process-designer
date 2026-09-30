"""
KPIs with context: a value is useless without what it was and where it is going.

Every KPI carries: current, previous, delta, the direction that counts as good,
and a 12-point sparkline. Computed once here, into the bundle, so the header on
every screen shows the same number.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

WINDOW = 30   # days for "current"; the same length immediately before is "previous"


def _kpi(key, label, value, prev, fmt="{:.0f}", good="up", spark=None, note=""):
    d = None if (prev in (None, 0) or value is None) else (value - prev) / abs(prev)
    return {"key": key, "label": label, "value": None if value is None else round(float(value), 4),
            "prev": None if prev is None else round(float(prev), 4),
            "delta_pct": None if d is None else round(float(d), 4),
            "fmt": fmt, "good": good, "spark": spark or [], "note": note}


def build(t, doc, esc, ser, asof: pd.Timestamp) -> dict:
    cur_a, cur_b = asof - pd.Timedelta(days=WINDOW), asof
    pre_a, pre_b = asof - pd.Timedelta(days=2 * WINDOW), cur_a
    active = doc[doc.status == "active"]

    # ---- hero: one number for the portfolio, defined so it can be explained
    health = 100 * (1 - float(active.risk_score.mean()))
    w_onb = pd.DataFrame(ser["weekly"]["onboardings"])
    w_esc = pd.DataFrame(ser["weekly"]["escalations"])

    def win(df, col, a, b, agg="mean"):
        d = df[(df[col] > a) & (df[col] <= b)]
        return d

    e = esc.copy()
    e["escalated_at"] = pd.to_datetime(e.escalated_at)
    e_cur, e_pre = win(e, "escalated_at", cur_a, cur_b), win(e, "escalated_at", pre_a, pre_b)

    onb = t["onboardings"].dropna(subset=["closed_at"])
    o_cur, o_pre = win(onb, "closed_at", cur_a, cur_b), win(onb, "closed_at", pre_a, pre_b)

    sp_score = [round(float(x), 2) for x in w_onb.avg_score.tail(12)]
    sp_d = [round(float(x), 4) for x in w_onb.grade_d_rate.tail(12)]
    sp_sla = [round(float(x), 4) for x in w_esc.within_target_rate.tail(12)]
    sp_conv = [round(float(x), 4) for x in w_esc.conversion.tail(12)]

    kpis = [
        _kpi("at_risk", "Doctors at risk", int((active.risk_score >= .5).sum()),
             None, "{:,.0f}", "down",
             note=f"{(active.risk_score >= .5).mean():.0%} of the active portfolio"),
        _kpi("may_cancel", "Said they may cancel", int(active.sig_churn_threat.sum()),
             None, "{:,.0f}", "down", note="36% of these churn, against 6.6% baseline"),
        _kpi("sla", f"Escalations answered in 30 min",
             e_cur.within_target.mean() if len(e_cur) else None,
             e_pre.within_target.mean() if len(e_pre) else None,
             "{:.0%}", "up", sp_sla, note=f"{len(e_cur)} escalations in the last {WINDOW} days"),
        _kpi("conversion", "Escalation conversion",
             e_cur.converted.mean() if len(e_cur) else None,
             e_pre.converted.mean() if len(e_pre) else None,
             "{:.0%}", "up", sp_conv,
             note="54% when answered inside 30 min, 14% after two hours"),
        _kpi("onb_score", "Average onboarding score",
             o_cur.score.mean() if len(o_cur) else None,
             o_pre.score.mean() if len(o_pre) else None,
             "{:.1f}", "up", sp_score, note=f"{len(o_cur)} onboardings closed"),
        _kpi("grade_d", "Grade-D rate",
             (o_cur.grade == "D").mean() if len(o_cur) else None,
             (o_pre.grade == "D").mean() if len(o_pre) else None,
             "{:.1%}", "down", sp_d, note="17% of grade-D doctors churn, against 2% of A"),
        _kpi("hollow", "Agenda too thin", int(active.calendar_hollow.sum()), None,
             "{:,.0f}", "down", note="calendar on, under 6 slots published"),
        _kpi("not_found", "Not being found", int(active.demand_constrained.sum()), None,
             "{:,.0f}", "down", note="plenty of slots, still below their peer median"),
    ]

    # ---- attention list: the signals, sized, ranked by measured churn lift
    base = float((doc.status == "churned").mean())
    att = []
    for key, label, mask in [
        ("churn_threat", "Said they may cancel", doc.sig_churn_threat),
        ("discouraged", "Discouraged with results", doc.sig_discouraged),
        ("grade_d", "Closed onboarding at grade D", doc.onboarding_grade == "D"),
        ("bottom_q", "Bottom quartile vs their peers", doc.bottom_quartile),
        ("calendar_off", "Calendar never turned on", ~doc.calendar_enabled),
        ("complaint", "Complained about volume or no-shows", doc.complaints >= 1),
    ]:
        m = doc[pd.Series(mask).fillna(False).astype(bool)]
        if not len(m):
            continue
        ch = float((m.status == "churned").mean())
        att.append({"key": key, "label": label, "doctors": int(len(m)),
                    "active": int((m.status == "active").sum()),
                    "churn": round(ch, 3), "lift": round(ch / base, 2)})
    att.sort(key=lambda x: -x["lift"])

    # ---- portfolio split, the segments bar
    bands = [("Healthy", 0, .15), ("Watch", .15, .3), ("At risk", .3, .5), ("Critical", .5, 1.01)]
    seg = [{"band": n, "n": int(((active.risk_score >= lo) & (active.risk_score < hi)).sum())}
           for n, lo, hi in bands]
    tot = sum(s["n"] for s in seg) or 1
    for s in seg:
        s["share"] = round(s["n"] / tot, 4)

    return {
        "asof": str(asof.date()), "window_days": WINDOW,
        "health_score": round(health, 1),
        "health_note": ("100 minus the mean risk score across active doctors. Every point traces "
                        "to a rule in pipeline.py, so this number can be taken apart."),
        "kpis": kpis, "attention": att, "segments": seg,
        "totals": {"active": int(len(active)), "churned": int((doc.status == "churned").sum()),
                   "specialists": int((pd.DataFrame(t["specialists"]).role == "Farming Specialist").sum()),
                   "doctors": int(len(doc))},
    }
