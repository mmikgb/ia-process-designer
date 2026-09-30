"""
Daily and weekly rollups.

Only the series that have the volume to support the grain they are drawn at.
See FINDINGS.md: escalations run ~3/day, so they are weekly; bookings are
monthly in the source and stay monthly.
"""
from __future__ import annotations
import pandas as pd

from i18n import L

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
        "note": L("Bookings are monthly in the source system — five complete months exist "
                  "(Apr-Aug 2026). There is no daily or weekly booking series to draw. "
                  "Escalations average 3/day, so rates are weekly; the daily series is counts only.",
                  "Las citas son mensuales en el sistema de origen: hay cinco meses completos "
                  "(abr-ago 2026). No existe una serie diaria ni semanal de citas que dibujar. "
                  "Las escalaciones promedian 3 al día, así que las tasas son semanales; la serie "
                  "diaria son solo conteos."),
    }


# ---- Pulse: daily series ready to draw -------------------------------------

def _finding(r7: list, rate: bool, decimals: int = 0, weeks: int = 4) -> dict | None:
    """The row's headline: the last 7-day average against the one `weeks` weeks earlier.
    Within ±5% it is "about the same"; whether a move is real is the Control screen's job."""
    vals = [v for v in r7 if v is not None]
    if len(vals) <= weeks * 7:
        return None
    a, b = vals[-1], vals[-1 - weeks * 7]
    fmt = (lambda v: f"{100 * v:.0f}%") if rate else (lambda v: f"{v:.{decimals}f}")
    per = "" if rate else ("/day", " al día")
    if b and abs(a - b) / abs(b) <= 0.05:
        return L(f"{fmt(a)}{per[0] if per else ''} on the 7-day average, about the same as {weeks} weeks ago",
                 f"{fmt(a)}{per[1] if per else ''} en el promedio de 7 días, casi igual que hace {weeks} semanas")
    up = a > b
    return L(f"{fmt(a)}{per[0] if per else ''} on the 7-day average, {'up' if up else 'down'} from {fmt(b)} {weeks} weeks ago",
             f"{fmt(a)}{per[1] if per else ''} en el promedio de 7 días, {'arriba' if up else 'abajo'} de {fmt(b)} hace {weeks} semanas")


def _filled(rows: list[dict], end: str, value="n") -> list[dict]:
    """Every day between the series' first and last recorded date. A gap inside
    that span is a real zero (nothing happened) and is filled. The span stops
    at the last recorded day, not at the extract date: filling the tail would
    draw a collapse that is only the extract ending."""
    if not rows:
        return []
    s = pd.Series({r["date"]: r[value] for r in rows})
    idx = pd.date_range(min(s.index), min(max(s.index), end), freq="D").strftime("%Y-%m-%d")
    return [{"date": d, value: float(s.get(d, 0))} for d in idx]


def _roll(vals: list[float], w: int = 7) -> list[float | None]:
    out = pd.Series(vals).rolling(w, min_periods=w).mean()
    return [None if pd.isna(v) else round(float(v), 2) for v in out]


def pulse(t: dict, ser: dict, end: str, events_csv) -> dict:
    """What Pulse draws. The seven-day line is the read; daily bars keep their
    weekday shape visible. Escalations stay a count; bookings stay monthly."""
    d = ser["daily"]
    rows = []
    for key, label, src in [
        ("interactions", L("Interactions logged", "Interacciones registradas"), "interactions"),
        ("enrollments", L("Campaign enrollments", "Inscripciones a campañas"), "enrollments"),
        ("onboardings_started", L("Onboardings started", "Onboardings iniciados"), "onboardings_started"),
        ("onboardings_closed", L("Onboardings closed", "Onboardings cerrados"), "onboardings_closed"),
        ("escalations", L("Escalations raised (count only)", "Escalaciones (solo conteo)"), "escalations"),
    ]:
        pts = _filled(d[src], end)
        r7 = _roll([p["n"] for p in pts])
        zeros = [p["date"] for p in pts if p["n"] == 0]
        dom = sorted({int(z[8:]) for z in zeros})
        rows.append({"key": key, "label": label, "unit": "per day",
                     "points": [{"date": p["date"], "n": int(p["n"]), "r7": r}
                                for p, r in zip(pts, r7)],
                     # zero days inside the span; when they all fall on the same
                     # days of the month it is how the extract was made, not a pause
                     "zero_days": zeros,
                     "zero_pattern": (L(f"all on day {dom[0]}-{dom[-1]} of a month",
                                        f"todos en los días {dom[0]}-{dom[-1]} del mes")
                                      if zeros and len(dom) <= 3 and dom[0] >= 28 else None)})
        rows[-1]["finding"] = _finding([p["r7"] for p in rows[-1]["points"]], rate=False,
                                       decimals=1 if key == "escalations" else 0)

    # engagement is a rate: weight the 7-day window by volume, never average daily rates
    enr = pd.DataFrame(d["enrollments"]).set_index("date")
    idx = pd.date_range(enr.index.min(), min(enr.index.max(), end), freq="D").strftime("%Y-%m-%d")
    n = enr.n.reindex(idx, fill_value=0)
    eng = (enr.n * enr.engaged_rate).reindex(idx, fill_value=0)
    rate = (eng.rolling(7, min_periods=7).sum() / n.rolling(7, min_periods=7).sum())
    eng_pts = [{"date": i, "n": None, "r7": None if pd.isna(v) else round(float(v), 4)}
               for i, v in zip(idx, rate)]
    rows.insert(2, {"key": "engagement",
                    "label": L("Campaign engagement rate, 7-day", "Tasa de respuesta a campañas, 7 días"),
                    "unit": "rate", "points": eng_pts,
                    "finding": _finding([p["r7"] for p in eng_pts], rate=True)})

    # events: the hand-kept file plus facts the data already dates
    ev = []
    try:
        f = pd.read_csv(events_csv, dtype=str).dropna(subset=["date", "label"])
        # optional label_es column; without it both languages show the label as written
        es = lambda r: getattr(r, "label_es", None) if isinstance(getattr(r, "label_es", None), str) else r.label
        ev += [{"date": r.date, "label": L(r.label, es(r)), "kind": getattr(r, "kind", "manual") or "manual"}
               for r in f.itertuples()]
    except FileNotFoundError:
        pass
    first = t["campaign_enrollments"].groupby("campaign_id").enrolled_at.min()
    asks = t["campaigns"].set_index("campaign_id").ask
    # the campaign's ask is data (as written in the source), not translated
    ev += [{"date": str(v.date()), "label": L(f"{k} starts: {asks.get(k, '')}", f"Inicia {k}: {asks.get(k, '')}"),
            "kind": "campaign"} for k, v in first.items()]

    bk = t["bookings_monthly"]
    months = (bk.groupby("month").agg(patient_bookings=("patient_bookings", "sum"),
                                      doctors=("doctor_id", "nunique")).reset_index())
    months["month"] = months.month.astype(str)
    # the book grew fivefold over these months; per doctor is the fair read
    months["per_doctor"] = (months.patient_bookings / months.doctors).round(1)
    return {
        "end": end,
        "rows": rows,
        "events": sorted(ev, key=lambda e: e["date"]),
        "bookings_monthly": months.to_dict("records"),
        "note": ser["note"],
    }
