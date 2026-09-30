"""
Daily and weekly rollups.

Only the series that have the volume to support the grain they are drawn at.
See FINDINGS.md: escalations run ~3/day, so they are weekly; bookings are
monthly in the source and stay monthly.
"""
from __future__ import annotations
import pandas as pd

DAILY_OK = ["interactions", "enrollments", "onboardings_started", "onboardings_closed"]


def _daily(s: pd.Series) -> pd.DataFrame:
    g = s.dt.date.value_counts().sort_index()
    return pd.DataFrame({"date": [str(d) for d in g.index], "n": g.values})


def build(t: dict) -> dict:
    inter, enr, onb, esc = t["interactions"], t["campaign_enrollments"], t["onboardings"], t["escalations"]

    d_int = _daily(inter.occurred_at)
    io = inter.assign(d=inter.occurred_at.dt.date).groupby(["d", "direction"]).size().unstack(fill_value=0)
    d_int["inbound"] = d_int.date.map({str(k): int(v) for k, v in io.get("inbound", pd.Series()).items()}).fillna(0).astype(int)
    d_int["outbound"] = d_int.date.map({str(k): int(v) for k, v in io.get("outbound", pd.Series()).items()}).fillna(0).astype(int)

    d_enr = _daily(enr.enrolled_at)
    eg = enr.assign(d=enr.enrolled_at.dt.date).groupby("d").engaged.mean()
    d_enr["engaged_rate"] = d_enr.date.map({str(k): round(float(v), 4) for k, v in eg.items()})

    d_start = _daily(onb.started_at)

    d_close = _daily(onb.closed_at)
    cl = onb.dropna(subset=["closed_at"]).assign(d=onb.closed_at.dt.date)
    d_close["grade_d_rate"] = d_close.date.map(
        {str(k): round(float(v), 4) for k, v in cl.groupby("d").grade.apply(lambda s: (s == "D").mean()).items()})
    d_close["avg_score"] = d_close.date.map(
        {str(k): round(float(v), 2) for k, v in cl.groupby("d").score.mean().items()})

    from pipeline import RULES
    e = esc.copy()
    e["within_target"] = e.minutes_to_pickup <= RULES["escalation_pickup_target_min"]
    e["week"] = e.escalated_at.dt.to_period("W")
    w_esc = e.groupby("week").agg(n=("escalation_id", "size"),
                                  median_pickup=("minutes_to_pickup", "median"),
                                  within_target_rate=("within_target", "mean"),
                                  conversion=("converted", "mean")).reset_index()
    w_esc["week"] = w_esc.week.astype(str)

    o = onb.dropna(subset=["closed_at"]).copy()
    o["week"] = o.closed_at.dt.to_period("W")
    w_onb = o.groupby("week").agg(n=("onboarding_id", "size"),
                                  grade_d_rate=("grade", lambda s: (s == "D").mean()),
                                  avg_score=("score", "mean")).reset_index()
    # Two series, same unit, summing to the total — the only case where stacking
    # is honest. This is the hero chart on the overview.
    w_onb["activated"] = o[o.grade.isin(["A", "B"])].groupby("week").size().reindex(
        o.groupby("week").size().index).fillna(0).astype(int).values
    w_onb["struggling"] = w_onb.n - w_onb.activated
    w_onb["week"] = w_onb.week.astype(str)

    r = lambda df: df.round(4).to_dict("records")
    return {
        "daily": {"interactions": r(d_int), "enrollments": r(d_enr),
                  "onboardings_started": r(d_start), "onboardings_closed": r(d_close),
                  "escalations": r(_daily(esc.escalated_at))},
        "weekly": {"escalations": r(w_esc), "onboardings": r(w_onb)},
        "note": ("Bookings are monthly in the source system — five complete months exist "
                 "(Apr-Aug 2026). There is no daily or weekly booking series to draw. "
                 "Escalations average 3/day, so rates are weekly; the daily series is counts only."),
    }
