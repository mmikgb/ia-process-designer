"""
Control charts. Real limits, frozen baseline, three signal rules.

Three chart types, chosen by what the data is — not by preference:
  p-chart   a proportion from a variable denominator (limits move with n)
  c-chart   a count of events per period (Poisson; works where n is small)
  XmR       one value per period (individuals + moving range)

The baseline is FROZEN. Rolling limits absorb the shift you are trying to
detect, and after a bad quarter the chart declares the bad quarter normal.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

BASELINE = ("2026-03-01", "2026-06-30")
D2 = 1.128  # d2 for a moving range of n=2, the standard XmR constant


def _rules(vals, center, sigma) -> list[list[str]]:
    """Western Electric 1, 2 and 4. Each point gets the rules it fires."""
    v = np.asarray(vals, dtype=float)
    s = np.asarray(sigma, dtype=float)
    c = np.asarray(center, dtype=float)
    z = np.divide(v - c, s, out=np.zeros_like(v), where=s > 0)
    out = [[] for _ in v]
    for i in range(len(v)):
        if abs(z[i]) > 3:
            out[i].append("rule1")                      # beyond 3 sigma
    for i in range(2, len(v)):
        w = z[i - 2:i + 1]
        for side in (1, -1):
            if sum(1 for x in w if x * side > 2) >= 2 and z[i] * side > 2:
                out[i].append("rule2")                  # 2 of 3 beyond 2 sigma
    for i in range(7, len(v)):
        w = z[i - 7:i + 1]
        if all(x > 0 for x in w) or all(x < 0 for x in w):
            out[i].append("rule3")                      # 8 in a row one side
    return [sorted(set(x)) for x in out]


def p_chart(df, period, num, den, label) -> dict:
    d = df.dropna(subset=[num, den]).copy()
    d = d[d[den] > 0]
    base = d[(d[period] >= BASELINE[0]) & (d[period] <= BASELINE[1])]
    if len(base) < 8:
        base = d
    pbar = float(base[num].sum() / base[den].sum())
    sigma = np.sqrt(pbar * (1 - pbar) / d[den].to_numpy())
    vals = (d[num] / d[den]).to_numpy()
    sig = _rules(vals, np.full(len(vals), pbar), sigma)
    return {
        "chart": "p", "label": label, "center": round(pbar, 4),
        "baseline": {"from": BASELINE[0], "to": BASELINE[1], "frozen": True, "n_points": len(base)},
        "points": [{"period": str(p), "value": round(float(v), 4), "n": int(n),
                    "ucl": round(float(min(pbar + 3 * s, 1)), 4),
                    "lcl": round(float(max(pbar - 3 * s, 0)), 4), "signals": g}
                   for p, v, n, s, g in zip(d[period], vals, d[den], sigma, sig)],
    }


def c_chart(df, period, count, label) -> dict:
    d = df.dropna(subset=[count]).copy()
    base = d[(d[period] >= BASELINE[0]) & (d[period] <= BASELINE[1])]
    if len(base) < 8:
        base = d
    cbar = float(base[count].mean())
    s = np.sqrt(cbar)
    vals = d[count].to_numpy(dtype=float)
    sig = _rules(vals, np.full(len(vals), cbar), np.full(len(vals), s))
    return {
        "chart": "c", "label": label, "center": round(cbar, 3),
        "baseline": {"from": BASELINE[0], "to": BASELINE[1], "frozen": True, "n_points": len(base)},
        "points": [{"period": str(p), "value": float(v), "n": int(v),
                    "ucl": round(cbar + 3 * s, 3), "lcl": round(max(cbar - 3 * s, 0), 3),
                    "signals": g} for p, v, g in zip(d[period], vals, sig)],
    }


def xmr(df, period, value, label, floor: float | None = None) -> dict:
    """Individuals chart. `floor` clips the lower limit for a measure that cannot go below it
    (minutes, scores): a limit at -35 minutes is arithmetic, not a threshold anyone can cross."""
    d = df.dropna(subset=[value]).copy()
    base = d[(d[period] >= BASELINE[0]) & (d[period] <= BASELINE[1])]
    if len(base) < 8:
        base = d
    xbar = float(base[value].mean())
    mr = base[value].diff().abs().dropna()
    mrbar = float(mr.mean()) if len(mr) else 0.0
    s = mrbar / D2 if mrbar else float(base[value].std() or 1)
    vals = d[value].to_numpy(dtype=float)
    sig = _rules(vals, np.full(len(vals), xbar), np.full(len(vals), s))
    lcl = xbar - 3 * s if floor is None else max(xbar - 3 * s, floor)
    return {
        "chart": "xmr", "label": label, "center": round(xbar, 3), "sigma": round(s, 3),
        "baseline": {"from": BASELINE[0], "to": BASELINE[1], "frozen": True, "n_points": len(base)},
        "points": [{"period": str(p), "value": round(float(v), 3),
                    "ucl": round(xbar + 3 * s, 3), "lcl": round(lcl, 3),
                    "signals": g} for p, v, g in zip(d[period], vals, sig)],
    }


def stability(chart: dict) -> dict:
    """Is the process stable enough for a control chart to mean anything?

    If a large share of BASELINE points are already out of control, the process
    was never in control and the limits describe chaos. Say so rather than ship
    a chart that cries wolf. Threshold from the plan: ~10%.
    """
    b = chart["baseline"]
    pts = [p for p in chart["points"] if b["from"] <= p["period"] <= b["to"]]
    if not pts:
        return {"stable": None, "note": "no baseline points"}
    out = sum(1 for p in pts if p["signals"])
    frac = out / len(pts)
    return {
        "stable": bool(frac <= 0.10),
        "baseline_out_of_control": round(frac, 3),
        "note": ("Baseline is stable; limits are meaningful."
                 if frac <= 0.10 else
                 f"{frac:.0%} of baseline points are out of control. This process was not stable "
                 "during the baseline window, so treat these limits as descriptive, not as an alarm "
                 "threshold. Investigate the process before acting on single points."),
    }


def build(t: dict, ser: dict) -> dict:
    onb, esc = t["onboardings"], t["escalations"]

    cl = onb.dropna(subset=["closed_at"]).copy()
    cl["date"] = cl.closed_at.dt.date.astype(str)
    daily_d = cl.groupby("date").agg(n=("grade", "size"), d=("grade", lambda s: (s == "D").sum())).reset_index()

    e = esc.copy()
    e["date"] = e.escalated_at.dt.date.astype(str)
    daily_e = e.groupby("date").size().rename("n").reset_index()

    w_onb = pd.DataFrame(ser["weekly"]["onboardings"])
    w_esc = pd.DataFrame(ser["weekly"]["escalations"])
    for w in (w_onb, w_esc):
        w["period"] = w.week.str.slice(0, 10)

    charts = {
        "onboarding_grade_d_daily": p_chart(daily_d, "date", "d", "n",
                                            "Grade-D rate on onboardings closed, daily"),
        "escalations_daily": c_chart(daily_e, "date", "n",
                                     "Escalations raised per day"),
        "pickup_weekly": xmr(w_esc, "period", "median_pickup",
                             "Median escalation pickup, minutes, weekly", floor=0),
        "onboarding_score_weekly": xmr(w_onb, "period", "avg_score",
                                       "Average onboarding score, weekly", floor=0),
    }
    for c in charts.values():
        c["stability"] = stability(c)
    return charts
