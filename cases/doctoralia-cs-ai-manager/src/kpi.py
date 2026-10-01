"""
KPIs with context: a value is useless without what it was and where it is going.

Every KPI carries: current, previous, delta, the direction that counts as good,
and a 12-point sparkline. Computed once here, into the bundle, so the header on
every screen shows the same number.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from i18n import L, pct

WINDOW = 30   # days for "current"; the same length immediately before is "previous"
BUCKETS = ["<30m", "30-60m", "60-120m", "120m+"]

# The attention signals. One definition: the attention list sizes them, and bundle.py
# tags every doctor with the keys they carry, so /doctores?signal=… lists the same people.
ATTENTION = [
    ("churn_threat", L("Said they may cancel", "Dijo que cancelaría"), lambda d: d.sig_churn_threat),
    ("discouraged", L("Discouraged with results", "Desanimado con los resultados"),
     lambda d: d.sig_discouraged),
    ("grade_d", L("Closed onboarding at grade D", "Cerró el onboarding con grado D"),
     lambda d: d.onboarding_grade == "D"),
    ("bottom_q", L("Bottom quartile vs their peers", "Cuartil bajo frente a sus pares"),
     lambda d: d.bottom_quartile),
    ("calendar_off", L("Calendar never turned on", "Nunca prendió su agenda"),
     lambda d: ~d.calendar_enabled),
    ("complaint", L("Complained about volume or no-shows", "Se quejó de volumen o inasistencias"),
     lambda d: d.complaints >= 1),
]

# The risk bands of the segments bar, [lo, hi). /doctores?risk_band=… uses the same cuts.
RISK_BANDS = [("healthy", L("Healthy", "Sana"), 0, .15), ("watch", L("Watch", "Vigilar"), .15, .3),
              ("at_risk", L("At risk", "En riesgo"), .3, .5), ("critical", L("Critical", "Crítica"), .5, 1.01)]


def attention_masks(doc: pd.DataFrame) -> dict[str, pd.Series]:
    return {k: pd.Series(f(doc), index=doc.index).fillna(False).astype(bool) for k, _, f in ATTENTION}


def _kpi(key, label, value, prev, fmt="{:.0f}", good="up", spark=None, note="",
         n=None, prev_n=None, rate=False):
    """`n` is the denominator of a rate (None for counts). A rate on fewer than
    RULES["min_n_rate"] cases is withheld, and so is a delta when either window is short."""
    from pipeline import RULES
    min_n = RULES["min_n_rate"]
    suppressed = None
    if rate and n is not None and n < min_n:
        value, prev = None, None
        suppressed = L(f"Only {n} cases: too few for a rate",
                       f"Solo {n} casos: muy pocos para un porcentaje")
    d = None if (prev in (None, 0) or value is None) else (value - prev) / abs(prev)
    if rate and prev_n is not None and prev_n < min_n:
        d = None
    out = {"key": key, "label": label, "value": None if value is None else round(float(value), 4),
           "prev": None if prev is None else round(float(prev), 4),
           "delta_pct": None if d is None else round(float(d), 4),
           "fmt": fmt, "good": good, "spark": spark or [], "note": note,
           "n": None if n is None else int(n)}
    if suppressed:
        out["suppressed"] = suppressed
    return out


def conversion_buckets(esc: pd.DataFrame, min_n: int) -> list[dict]:
    """Conversion by pickup bucket, people only. The one source for "53% when fast"."""
    e = esc[esc.is_person] if "is_person" in esc else esc
    out = []
    for bk in BUCKETS:
        m = e[e.pickup_bucket == bk]
        if len(m) >= min_n:
            out.append({"bucket": bk, "n": int(len(m)), "converted": round(float(m.converted.mean()), 4)})
    return out


def context(doc: pd.DataFrame, esc: pd.DataFrame) -> dict:
    """Portfolio-wide figures the notes quote. Computed once on the whole book and
    passed to every scope, so the note reads the same on every screen."""
    from pipeline import RULES
    a = doc[doc.onboarding_grade == "A"]
    return {"buckets": conversion_buckets(esc, RULES["min_n_rate"]),
            "churn_grade_a": float((a.status == "churned").mean()) if len(a) else None}


def build(t, doc, esc, ser, asof: pd.Timestamp, window: int = WINDOW, ctx: dict | None = None) -> dict:
    from pipeline import RULES, LIFT, BASELINE_CHURN  # labels quote the rules in force
    target, slots = RULES["escalation_pickup_target_min"], RULES["calendar_healthy_slots"]
    ctx = ctx or context(doc, esc)
    bk = {b["bucket"]: b["converted"] for b in ctx["buckets"]}
    if "<30m" in bk and "120m+" in bk:
        conv_note = L(f"{pct(bk['<30m'])} when answered inside 30 min, {pct(bk['120m+'])} after two hours",
                      f"{pct(bk['<30m'])} si se atiende en menos de 30 min, {pct(bk['120m+'])} "
                      "después de dos horas")
    else:
        conv_note = L("conversion by pickup time is on the team screen",
                      "la conversión por tiempo de atención está en Mi equipo")
    grade_a = ctx["churn_grade_a"]
    d_note = (L(f"{pct(LIFT['grade_D'][1])} of grade-D doctors churn, against {pct(grade_a)} of A",
                f"el {pct(LIFT['grade_D'][1])} de los doctores grado D se van, contra "
                f"{pct(grade_a)} de los A")
              if grade_a is not None else
              L(f"{pct(LIFT['grade_D'][1])} of grade-D doctors churn",
                f"el {pct(LIFT['grade_D'][1])} de los doctores grado D se van"))
    cur_a, cur_b = asof - pd.Timedelta(days=window), asof
    pre_a, pre_b = asof - pd.Timedelta(days=2 * window), cur_a
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

    share = pct(float((active.risk_score >= .5).mean())) if len(active) else "0%"
    kpis = [
        _kpi("at_risk", L("Doctors at critical risk", "Doctores en riesgo crítico"),
             int((active.risk_score >= .5).sum()), None, "{:,.0f}", "down",
             note=L(f"{share} of the active portfolio", f"{share} de la cartera activa")),
        _kpi("may_cancel", L("Said they may cancel", "Dijeron que cancelarían"),
             int(active.sig_churn_threat.sum()), None, "{:,.0f}", "down",
             note=L(f"{pct(LIFT['churn_threat'][1])} of these churn, against "
                    f"{pct(BASELINE_CHURN, 1)} baseline",
                    f"el {pct(LIFT['churn_threat'][1])} de estos se van, contra "
                    f"{pct(BASELINE_CHURN, 1)} de base")),
        _kpi("sla", L(f"Escalations answered in {target} min",
                      f"Escalaciones atendidas en {target} min"),
             e_cur.within_target.mean() if len(e_cur) else None,
             e_pre.within_target.mean() if len(e_pre) else None,
             "{:.0%}", "up", sp_sla,
             note=L(f"{len(e_cur)} escalations in the last {window} days",
                    f"{len(e_cur)} escalaciones en los últimos {window} días"),
             n=len(e_cur), prev_n=len(e_pre), rate=True),
        _kpi("conversion", L("Escalation conversion", "Conversión de escalaciones"),
             e_cur.converted.mean() if len(e_cur) else None,
             e_pre.converted.mean() if len(e_pre) else None,
             "{:.0%}", "up", sp_conv, note=conv_note,
             n=len(e_cur), prev_n=len(e_pre), rate=True),
        _kpi("onb_score", L("Average onboarding score", "Calificación promedio de onboarding"),
             o_cur.score.mean() if len(o_cur) else None,
             o_pre.score.mean() if len(o_pre) else None,
             "{:.1f}", "up", sp_score,
             note=L(f"{len(o_cur)} onboardings closed", f"{len(o_cur)} onboardings cerrados"),
             n=len(o_cur)),
        _kpi("grade_d", L("Grade-D rate", "Tasa de grado D"),
             (o_cur.grade == "D").mean() if len(o_cur) else None,
             (o_pre.grade == "D").mean() if len(o_pre) else None,
             "{:.1%}", "down", sp_d, note=d_note,
             n=len(o_cur), prev_n=len(o_pre), rate=True),
        _kpi("hollow", L("Agenda too thin", "Agenda muy delgada"),
             int(active.calendar_hollow.sum()), None, "{:,.0f}", "down",
             note=L(f"calendar on, under {slots} slots published",
                    f"agenda encendida, menos de {slots} horarios publicados")),
        _kpi("not_found", L("Not being found", "No lo encuentran"),
             int(active.demand_constrained.sum()), None, "{:,.0f}", "down",
             note=L("plenty of slots, still below their peer median",
                    "horarios de sobra y aún debajo de la mediana de sus pares")),
    ]

    # ---- attention list: the signals, sized, ranked by measured churn lift
    base = float((doc.status == "churned").mean())
    att = []
    masks = attention_masks(doc)
    for key, label, _ in ATTENTION:
        mask = masks[key]
        m = doc[mask]
        if not len(m):
            continue
        ch = float((m.status == "churned").mean())
        att.append({"key": key, "label": label, "doctors": int(len(m)),
                    "active": int((m.status == "active").sum()),
                    "churn": round(ch, 3), "lift": round(ch / base, 2)})
    att.sort(key=lambda x: -x["lift"])

    # ---- portfolio split, the segments bar
    seg = [{"key": k, "band": n, "n": int(((active.risk_score >= lo) & (active.risk_score < hi)).sum())}
           for k, n, lo, hi in RISK_BANDS]
    tot = sum(s["n"] for s in seg) or 1
    for s in seg:
        s["share"] = round(s["n"] / tot, 4)

    return {
        "asof": str(asof.date()), "window_days": window,
        "health_score": round(health, 1),
        "health_note": L("100 minus the mean risk score across active doctors. Every point traces "
                         "to a rule in pipeline.py, so this number can be taken apart.",
                         "100 menos el score de riesgo promedio de los doctores activos. Cada punto "
                         "sale de una regla en pipeline.py, así que el número se puede desarmar."),
        "kpis": kpis, "attention": att, "segments": seg,
        "totals": {"active": int(len(active)), "churned": int((doc.status == "churned").sum()),
                   "specialists": int((pd.DataFrame(t["specialists"]).role == "Farming Specialist").sum()),
                   "doctors": int(len(doc))},
    }


# ---- scoped views: the same KPIs for a team or one specialist's portfolio ----

PERIODS = [30, 60, 90]
BY_DOCTOR = ["doctors", "onboardings", "escalations", "interactions",
             "campaign_enrollments", "bookings_monthly"]


def _slice(t: dict, ids: set) -> dict:
    return {k: (v[v.doctor_id.isin(ids)] if k in BY_DOCTOR else v) for k, v in t.items()}


def scopes(t, doc, esc, asof: pd.Timestamp) -> dict:
    """KPIs for every portfolio a person can pick, at every period, computed here.

    A scope is a set of doctors: the whole book, a farming team, or one
    specialist's owned accounts. Onboardings and escalations follow the doctor,
    not the person who handled them, so "my portfolio" means what happened to
    my doctors. Churn and lift in the attention list stay portfolio-wide: a
    signal's lift is a property of the signal, and a 400-doctor book is too
    small to re-measure it.
    """
    import series  # local: series imports pipeline, which imports this module's callers
    sp = t["specialists"].merge(t["teams"], on="team_id")
    farm = sp[sp.role == "Farming Specialist"]
    groups = {"all": (set(doc.doctor_id), len(farm))}
    for team, g in farm.groupby("team_name"):
        groups[f"team:{team}"] = (set(doc[doc.owner_specialist_id.isin(g.specialist_id)].doctor_id), len(g))
    for sid in farm.specialist_id:
        groups[sid] = (set(doc[doc.owner_specialist_id == sid].doctor_id), 1)

    ctx = context(doc, esc)
    base = build(t, doc, esc, series.build(t), asof, ctx=ctx)
    lift = {a["key"]: (a["churn"], a["lift"]) for a in base["attention"]}

    out = {}
    for key, (ids, n_sp) in groups.items():
        ts, d, e = _slice(t, ids), doc[doc.doctor_id.isin(ids)], esc[esc.doctor_id.isin(ids)]
        ser = series.build(ts)
        per = {}
        for w in PERIODS:
            k = build(ts, d, e, ser, asof, window=w, ctx=ctx)
            for a in k["attention"]:
                a["churn"], a["lift"] = lift.get(a["key"], (a["churn"], a["lift"]))
            k["attention"].sort(key=lambda x: -x["lift"])
            k["totals"]["specialists"] = n_sp
            per[str(w)] = k
        out[key] = {"periods": per, "weekly_onboardings": ser["weekly"]["onboardings"]}
    return out


# ---- the manager's team view ----------------------------------------------

def team(t, doc, esc, asof: pd.Timestamp) -> dict:
    """One row per farming specialist: the work in their book and how their
    escalations were handled. Deliberately no conversion ranking: inside the
    30-minute bucket everyone converts about the same, so a raw conversion
    column measures the queue, not the person."""
    from pipeline import RULES
    min_n = RULES["min_n_rate"]   # below this, a specialist gets a count and no percentage
    sp = t["specialists"].merge(t["teams"], on="team_id")
    farm = sp[sp.role == "Farming Specialist"].sort_values("specialist_id")
    active = doc[doc.status == "active"]
    e = esc[esc.is_person].copy() if "is_person" in esc else esc.copy()
    e["week"] = pd.to_datetime(e.escalated_at).dt.to_period("W").dt.start_time
    weeks = sorted(e.week.unique())[-12:]

    rows = []
    for _, s in farm.iterrows():
        p = active[active.owner_specialist_id == s.specialist_id]
        x = e[e.specialist_id == s.specialist_id]
        enough = len(x) >= min_n
        wk = x.groupby("week").minutes_to_pickup.median()
        rows.append({
            "id": s.specialist_id, "name": s.specialist_name, "team": s.team_name,
            "portfolio": int(len(p)),
            "at_risk": int((p.risk_score >= .5).sum()),
            "at_risk_share": round(float((p.risk_score >= .5).mean()), 4) if len(p) else None,
            "may_cancel": int(p.sig_churn_threat.sum()),
            "hollow": int(p.calendar_hollow.sum()),
            "not_found": int(p.demand_constrained.sum()),
            "open_commitments": int(p.commitment_open.sum()),
            "escalations": int(len(x)),
            "median_pickup": None if not len(x) else round(float(x.minutes_to_pickup.median()), 1),
            "within_target": round(float(x.within_target.mean()), 4) if enough else None,
            "converted": round(float(x.converted.mean()), 4) if enough else None,
            "converted_when_fast": (round(float(x[x.within_target].converted.mean()), 4)
                                    if enough and x.within_target.any() else None),
            # same 12 weeks for everyone, so the strip shares one axis
            "pickup_weeks": [None if w not in wk.index else round(float(wk[w]), 1) for w in weeks],
        })

    buckets = conversion_buckets(e, min_n)

    nobody = esc[~esc.is_person] if "is_person" in esc else esc.iloc[0:0]
    return {
        "rows": rows,
        "weeks": [str(pd.Timestamp(w).date()) for w in weeks],
        "buckets": buckets,
        "target_min": RULES["escalation_pickup_target_min"],
        "min_escalations": min_n,
        "unowned": {"n": int(len(nobody)),
                    "by_queue": {str(k): int(v) for k, v in nobody.specialist_id.value_counts().items()}},
    }
