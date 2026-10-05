"""Portfolio control charts, calculated from a fixed historical baseline.

Rates use variable-denominator p charts, fixed-window event counts use c charts,
and one weekly aggregate uses an individuals (XmR) chart. A point with too few
cases is displayed for context but cannot create a statistical signal.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from i18n import L

BASELINE = ("2026-03-01", "2026-06-30")
D2 = 1.128


def _rules(vals, center, sigma) -> list[list[str]]:
    """Western Electric tests 1, 2 and the eight-point run, at the ending point."""
    v = np.asarray(vals, dtype=float)
    s = np.broadcast_to(np.asarray(sigma, dtype=float), v.shape)
    z = np.divide(v - center, s, out=np.full(v.shape, np.nan), where=s > 0)
    out = [[] for _ in v]
    for i, x in enumerate(z):
        if np.isfinite(x) and abs(x) > 3:
            out[i].append("rule1")
        if i >= 2:
            w = z[i - 2:i + 1]
            if np.isfinite(w).all() and (sum(w > 2) >= 2 or sum(w < -2) >= 2):
                out[i].append("rule2")
        if i >= 7:
            w = z[i - 7:i + 1]
            if np.isfinite(w).all() and ((w > 0).all() or (w < 0).all()):
                out[i].append("rule3")
    return out


def _base(d, period, eligible=None):
    b = d[(d[period] >= BASELINE[0]) & (d[period] <= BASELINE[1])]
    return b if eligible is None else b[eligible.loc[b.index]]


def _baseline(n):
    return {"from": BASELINE[0], "to": BASELINE[1], "frozen": True, "n_points": n}


def _unavailable(kind, label, d, reason):
    return {"chart": kind, "label": label, "center": 0, "baseline": _baseline(0),
            "points": [], "available": False, "data_note": reason}


def p_chart(df, period, num, den, label, min_n=1) -> dict:
    d = df.dropna(subset=[period, num, den]).sort_values(period).copy()
    d = d[d[den] > 0]
    eligible = d[den] >= min_n
    base = _base(d, period, eligible)
    if len(base) < 6 or base[den].sum() == 0:
        return _unavailable("p", label, d, L("Fewer than six eligible baseline periods; limits cannot be estimated.",
                                              "Menos de seis periodos válidos en la línea base; no se pueden estimar límites."))
    pbar = float(base[num].sum() / base[den].sum())
    sigma = np.sqrt(pbar * (1 - pbar) / d[den].to_numpy(dtype=float))
    vals = (d[num] / d[den]).to_numpy(dtype=float)
    test = np.where(eligible.to_numpy(), vals, np.nan)
    sig = _rules(test, pbar, sigma)
    return {"chart": "p", "label": label, "center": round(pbar, 4),
            "baseline": _baseline(len(base)), "available": True,
            "min_n": min_n, "excluded_points": int((~eligible).sum()),
            "points": [{"period": str(p), "value": round(float(v), 4), "n": int(n),
                        "eligible": bool(ok),
                        "ucl": round(float(min(pbar + 3 * s, 1)), 4),
                        "lcl": round(float(max(pbar - 3 * s, 0)), 4), "signals": g}
                       for p, v, n, s, ok, g in zip(d[period], vals, d[den], sigma, eligible, sig)]}


def c_chart(df, period, count, label) -> dict:
    d = df.dropna(subset=[period, count]).sort_values(period).copy()
    base = _base(d, period)
    if len(base) < 8:
        return _unavailable("c", label, d, L("Fewer than eight baseline periods; limits cannot be estimated.",
                                              "Menos de ocho periodos en la línea base; no se pueden estimar límites."))
    cbar = float(base[count].mean())
    sigma = np.sqrt(cbar)
    vals = d[count].to_numpy(dtype=float)
    sig = _rules(vals, cbar, sigma)
    return {"chart": "c", "label": label, "center": round(cbar, 3),
            "baseline": _baseline(len(base)), "available": True,
            "points": [{"period": str(p), "value": float(v), "n": int(v),
                        "ucl": round(cbar + 3 * sigma, 3),
                        "lcl": round(max(cbar - 3 * sigma, 0), 3), "signals": g}
                       for p, v, g in zip(d[period], vals, sig)]}


def xmr(df, period, value, label, floor=None) -> dict:
    d = df.dropna(subset=[period, value]).sort_values(period).copy()
    base = _base(d, period)
    if len(base) < 8:
        return _unavailable("xmr", label, d, L("Fewer than eight baseline periods; limits cannot be estimated.",
                                                "Menos de ocho periodos en la línea base; no se pueden estimar límites."))
    xbar = float(base[value].mean())
    mrbar = float(base[value].diff().abs().dropna().mean())
    if not np.isfinite(mrbar) or mrbar == 0:
        return _unavailable("xmr", label, d, L("No variation in the frozen baseline; limits cannot be estimated.",
                                                "No hay variación en la línea base congelada; no se pueden estimar límites."))
    sigma = mrbar / D2
    vals = d[value].to_numpy(dtype=float)
    sig = _rules(vals, xbar, sigma)
    lcl = xbar - 3 * sigma if floor is None else max(xbar - 3 * sigma, floor)
    return {"chart": "xmr", "label": label, "center": round(xbar, 3), "sigma": round(sigma, 3),
            "baseline": _baseline(len(base)), "available": True,
            "points": [{"period": str(p), "value": round(float(v), 3),
                        "ucl": round(xbar + 3 * sigma, 3), "lcl": round(lcl, 3), "signals": g}
                       for p, v, g in zip(d[period], vals, sig)]}


def stability(chart: dict) -> dict:
    if not chart["available"]:
        return {"stable": None, "baseline_out_of_control": 0,
                "note": chart["data_note"]}
    b = chart["baseline"]
    pts = [p for p in chart["points"] if b["from"] <= p["period"] <= b["to"]
           and p.get("eligible", True)]
    if not pts:
        return {"stable": None, "baseline_out_of_control": 0,
                "note": L("No eligible baseline points.", "Sin puntos válidos en la línea base.")}
    frac = sum(bool(p["signals"]) for p in pts) / len(pts)
    return {"stable": bool(frac <= 0.10), "baseline_out_of_control": round(frac, 3),
            "note": (L("Baseline is stable; limits are meaningful.", "Línea base estable; los límites son útiles.")
                     if frac <= 0.10 else
                     L("Baseline was unstable; treat limits as descriptive and investigate before escalating.",
                       "La línea base fue inestable; interpreta los límites como descripción e investiga antes de escalar."))}


def finding(chart: dict, asof: str, days=28) -> dict:
    if not chart["available"]:
        return chart["data_note"]
    if chart["stability"]["stable"] is False:
        return L("Baseline needs review before these signals become operational alerts.",
                 "Revisa la línea base antes de usar estas señales como alertas operativas.")
    since = str((pd.Timestamp(asof) - pd.Timedelta(days=days)).date())
    k = sum(bool(p["signals"]) for p in chart["points"] if p["period"] >= since)
    if not k:
        return L(f"No statistical signal in the last {days} days.",
                 f"Sin señal estadística en los últimos {days} días.")
    return L(f"{k} signaled period{'s' if k != 1 else ''} in the last {days} days: investigate the cause.",
             f"{k} periodo{'s' if k != 1 else ''} con señal en los últimos {days} días: investiga la causa.")


def _weekly(df, date_col, **aggregations):
    d = df.dropna(subset=[date_col]).copy()
    d["period"] = d[date_col].dt.to_period("W").dt.start_time.dt.strftime("%Y-%m-%d")
    return d.groupby("period", as_index=False).agg(**aggregations)


def _fixed_counts(df, date_col, freq):
    d = df.dropna(subset=[date_col]).copy()
    d["period"] = d[date_col].dt.to_period(freq).dt.start_time
    counts = d.groupby("period").size()
    if counts.empty:
        return pd.DataFrame(columns=["period", "n"])
    idx = pd.date_range(counts.index.min(), counts.index.max(), freq="D" if freq == "D" else "W-MON")
    return pd.DataFrame({"period": idx.strftime("%Y-%m-%d"), "n": counts.reindex(idx, fill_value=0).to_numpy()})


def build(t: dict, ser: dict, tagged: pd.DataFrame | None = None) -> dict:
    from pipeline import RULES
    from notes import tag_interactions

    onb = t["onboardings"].dropna(subset=["closed_at"]).copy()
    onb["date"] = onb.closed_at.dt.strftime("%Y-%m-%d")
    daily_d = onb.groupby("date", as_index=False).agg(
        n=("grade", "size"), d=("grade", lambda s: int((s == "D").sum())))
    weekly_onb = _weekly(onb, "closed_at", n=("grade", "size"),
        late=("days_to_close", lambda s: int((s > RULES["onboarding_window_days"]).sum())),
        cap=("days_to_close", lambda s: int((s == RULES["onboarding_window_days"]).sum())),
        score=("score", "mean"))

    esc = t["escalations"].dropna(subset=["escalated_at"]).copy()
    esc["fast"] = esc.minutes_to_pickup < RULES["escalation_pickup_target_min"]
    esc["converted_num"] = esc.converted.fillna(False).astype(int)
    esc["conversion_den"] = esc.converted.notna().astype(int)
    weekly_esc = _weekly(esc, "escalated_at", n=("escalation_id", "size"),
        pickup=("minutes_to_pickup", "median"), fast=("fast", "sum"),
        converted=("converted_num", "sum"), conversion_n=("conversion_den", "sum"))

    tagged = tagged if tagged is not None else tag_interactions(t["interactions"])
    threats = tagged[tagged.tag == "churn_threat"].drop_duplicates("interaction_id")
    threat_counts = _fixed_counts(threats, "occurred_at", "W")
    campaign = t["campaign_enrollments"].dropna(subset=["enrolled_at"]).copy()
    campaign["date"] = campaign.enrolled_at.dt.strftime("%Y-%m-%d")
    daily_campaign = campaign.groupby("date", as_index=False).agg(
        n=("enrollment_id", "size"), engaged=("engaged", "sum"))

    charts = {
        "onboarding_grade_d_daily": p_chart(daily_d, "date", "d", "n", L("Grade-D onboarding rate, daily", "Tasa de onboarding grado D, diaria")),
        "onboarding_score_weekly": xmr(weekly_onb, "period", "score", L("Average onboarding score, weekly", "Calificación promedio de onboarding, semanal"), floor=0),
        "onboarding_late_weekly": p_chart(weekly_onb, "period", "late", "n", L("Onboardings closed after 28 days, weekly", "Onboardings cerrados después de 28 días, semanal")),
        "onboarding_cap_weekly": p_chart(weekly_onb, "period", "cap", "n", L("Onboardings closed exactly on day 28, weekly", "Onboardings cerrados exactamente el día 28, semanal")),
        "escalations_daily": c_chart(_fixed_counts(esc, "escalated_at", "D"), "period", "n", L("Incoming escalations, daily", "Escalaciones recibidas, diarias")),
        "pickup_weekly": xmr(weekly_esc, "period", "pickup", L("Median escalation pickup, minutes, weekly", "Mediana de atención de escalaciones, minutos, semanal"), floor=0),
        "escalation_fast_weekly": p_chart(weekly_esc, "period", "fast", "n", L("Escalations picked up in under 30 minutes, weekly", "Escalaciones atendidas en menos de 30 minutos, semanal")),
        "escalation_conversion_weekly": p_chart(weekly_esc, "period", "converted", "conversion_n", L("Escalation conversion, weekly (n ≥ 15)", "Conversión de escalaciones, semanal (n ≥ 15)"), min_n=15),
        "churn_threat_notes_weekly": c_chart(threat_counts, "period", "n", L("Cancellation threat notes logged, weekly", "Notas de amenaza de cancelación registradas, semanal")),
        "campaign_engagement_daily": p_chart(daily_campaign, "date", "engaged", "n", L("Campaign engagement, daily", "Respuesta a campañas, diaria")),
    }
    # Slot count is a current snapshot, not a time series at calendar enablement.
    # It cannot support a valid historic creation-rate p chart.
    doctors = t["doctors"]
    enabled = doctors[doctors.calendar_enabled & doctors.calendar_enabled_at.notna()]
    charts["hollow_calendar_creation_weekly"] = {
        "chart": "p", "label": L("Hollow calendars when enabled (<6 slots)", "Agendas vacías al activarse (<6 horarios)"),
        "available": False, "center": 0, "baseline": _baseline(0), "points": [],
        "snapshot": {"hollow": int(enabled.weekly_slots_published.lt(RULES["calendar_healthy_slots"]).sum()),
                     "n": int(len(enabled))},
        "data_note": L("Current slots are available, but historical slots at enablement are not. Capture dated slot counts before using a creation-rate control chart.",
                       "Hay horarios actuales, pero no el número al activar la agenda. Registra horarios con fecha antes de usar una gráfica de control de creación.")}
    for chart in charts.values():
        chart["stability"] = stability(chart)
        chart["finding"] = finding(chart, RULES["extract_date"])
    return charts
