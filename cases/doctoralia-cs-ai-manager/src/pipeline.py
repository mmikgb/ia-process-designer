"""
Shared data layer for both deliverables (copilot + manager report).

One pass over the workbook produces three feature tables written to out/.
Nothing downstream touches the Excel file directly.

    python3 src/pipeline.py            # build everything
    python3 src/pipeline.py --check    # data quality only

Every number the copilot shows and every number the report shows comes from
here, so the two can never disagree.
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import numpy as np
import pandas as pd

import notes as N

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "dataset.xlsx"
OUT = ROOT / "out"

# ---------------------------------------------------------------------------
# RULES — every operating threshold lives here. Change a rule: change a line.
# ---------------------------------------------------------------------------
RULES = {
    "onboarding_window_days": 28,
    "calendar_healthy_slots": 6,      # the returns cliff sits between 2 and 6 slots,
                                      # not at 8. See FINDINGS.md section 9.
    "escalation_pickup_target_min": 30,
    "stale_contact_days": 21,         # farming account with no contact = drifting
    "booking_drop_pct": -0.20,        # month-over-month collapse worth flagging
    "low_confidence_floor": 0.55,     # copilot hands over to the human below this
    "campaign_fatigue_n": 3,          # campaigns in 60 days past which we stop enrolling
    "peer_low_percentile": 0.25,      # bottom quartile of their specialty is a signal
    "meaningful_peer_gap": 2.0,       # bookings/month below peers before we say so out loud
    "extract_date": "2026-09-25",
}

SHEETS = ["doctors", "onboardings", "campaigns", "campaign_enrollments",
          "escalations", "interactions", "bookings_monthly", "specialists", "teams"]
DATES = {
    "doctors": ["signup_date", "churned_at", "calendar_enabled_at"],
    "onboardings": ["started_at", "closed_at"],
    "campaign_enrollments": ["enrolled_at", "outcome_recorded_at"],
    "escalations": ["escalated_at"],
    "interactions": ["occurred_at"],
    "specialists": ["joined_at"],
}


def load(path: Path = DATA) -> dict[str, pd.DataFrame]:
    xl = pd.ExcelFile(path)
    t = {s: xl.parse(s) for s in SHEETS}
    for sheet, cols in DATES.items():
        for c in cols:
            t[sheet][c] = pd.to_datetime(t[sheet][c], errors="coerce")
    t["bookings_monthly"]["mp"] = pd.PeriodIndex(t["bookings_monthly"]["month"], freq="M")
    return t


# ---------------------------------------------------------------------------
# Data quality — runs on every build. Findings are reported, not swallowed.
# ---------------------------------------------------------------------------
def quality(t) -> list[dict]:
    d, o, e, enr, sp = t["doctors"], t["onboardings"], t["escalations"], t["campaign_enrollments"], t["specialists"]
    issues = []

    def flag(key, n, note, severity="warn"):
        if n:
            issues.append({"check": key, "rows": int(n), "note": note, "severity": severity})

    late = (o.days_to_close > RULES["onboarding_window_days"]).sum()
    flag("onboarding_past_window", late,
         f"Onboardings closed after day {RULES['onboarding_window_days']}, "
         f"max {int(o.days_to_close.max())}. The brief says nothing closes after day 28.", "error")

    at_cap = (o.days_to_close == RULES["onboarding_window_days"]).mean()
    if at_cap > 0.4:
        issues.append({"check": "onboarding_closes_at_cap", "rows": int((o.days_to_close == 28).sum()),
                       "note": f"{at_cap:.0%} of onboardings close on exactly day 28. "
                               "The window is closing them, not the work finishing.", "severity": "error"})

    flag("doctors_without_onboarding", (~d.doctor_id.isin(o.doctor_id)).sum(),
         "Doctors in the file with no onboarding record.")

    ghosts = set(e.specialist_id) - set(sp.specialist_id)
    if ghosts:
        issues.append({"check": "escalation_pseudo_owners", "rows": int(e.specialist_id.isin(ghosts).sum()),
                       "note": f"Escalations owned by non-people: {sorted(ghosts)}. "
                               "These are dropped escalations, not a person's queue.", "severity": "error"})

    briefed = {"S01", "S02", "S03", "S04", "S05", "S06"}
    extra = sorted(set(e.specialist_id) & set(sp.specialist_id) - briefed)
    if extra:
        flag("escalations_outside_named_six", e.specialist_id.isin(extra).sum(),
             f"Brief says S01-S06 handle escalations; {extra} also appear.")

    flag("campaign_outcome_unrecorded", enr.converted.isna().sum(),
         "Enrollments with no recorded outcome. Conversion rates are a sample, not a census.")

    idle = sorted(set(sp[sp.role == "Farming Specialist"].specialist_id) - set(e.specialist_id))
    flag("farming_specialists_never_escalated_to", len(idle),
         f"Farming specialists who never receive an escalation: {idle}.")
    return issues


# ---------------------------------------------------------------------------
# Feature tables
# ---------------------------------------------------------------------------
def doctor_features(t) -> pd.DataFrame:
    d = t["doctors"].copy()
    o = t["onboardings"].set_index("doctor_id")
    bk, inter, enr, esc = t["bookings_monthly"], t["interactions"], t["campaign_enrollments"], t["escalations"]
    extract = pd.Timestamp(RULES["extract_date"])

    d["onboarding_grade"] = d.doctor_id.map(o.grade)
    d["onboarding_score"] = d.doctor_id.map(o.score)
    d["onboarding_days"] = d.doctor_id.map(o.days_to_close)
    d["onboarding_closed_at"] = d.doctor_id.map(o.closed_at)
    d["closed_at_cap"] = d.onboarding_days.eq(RULES["onboarding_window_days"])
    d["specialist_id"] = d.owner_specialist_id

    # Bookings: level, direction, and the last full month
    b = bk.sort_values(["doctor_id", "mp"])
    last = b.groupby("doctor_id").tail(1).set_index("doctor_id")
    prev = b.groupby("doctor_id").tail(2).groupby("doctor_id").head(1).set_index("doctor_id")
    d["bookings_last"] = d.doctor_id.map(last.patient_bookings)
    d["bookings_prev"] = d.doctor_id.map(prev.patient_bookings)
    d["bookings_avg"] = d.doctor_id.map(b.groupby("doctor_id").patient_bookings.mean())
    d["bookings_change_pct"] = np.where(
        d.bookings_prev.gt(0), (d.bookings_last - d.bookings_prev) / d.bookings_prev, np.nan)

    # Contact recency and load
    ci = inter.groupby("doctor_id").occurred_at.max()
    d["last_contact"] = d.doctor_id.map(ci)
    d["days_since_contact"] = (extract - d.last_contact).dt.days
    d["contacts_total"] = d.doctor_id.map(inter.groupby("doctor_id").size()).fillna(0).astype(int)
    post = inter.merge(o[["closed_at"]], left_on="doctor_id", right_index=True, how="left")
    post = post[post.occurred_at > post.closed_at]
    d["contacts_farming"] = d.doctor_id.map(post.groupby("doctor_id").size()).fillna(0).astype(int)

    # Campaign history
    d["campaigns_enrolled"] = d.doctor_id.map(enr.groupby("doctor_id").size()).fillna(0).astype(int)
    d["campaigns_engaged"] = d.doctor_id.map(enr.groupby("doctor_id").engaged.sum()).fillna(0).astype(int)
    d["escalations"] = d.doctor_id.map(esc.groupby("doctor_id").size()).fillna(0).astype(int)

    # The finding that matters: calendar on, nothing published.
    d["calendar_hollow"] = d.calendar_enabled & d.weekly_slots_published.lt(RULES["calendar_healthy_slots"])

    d = booking_dynamics(d, bk)
    d = campaign_fatigue(d, enr, extract)
    d = peer_benchmark(d)

    # What the specialists wrote down. 29,846 notes, previously unused.
    tagged = N.tag_interactions(inter)
    sig = N.doctor_signals(tagged, extract)
    d = d.merge(sig, left_on="doctor_id", right_index=True, how="left")
    for c in ["sig_churn_threat", "sig_discouraged", "sig_gatekeeper", "sig_whatsapp_only",
              "sig_onboarding_no_show", "sig_hollow_calendar", "sig_multi_site",
              "sig_billing_issue", "commitment_open"]:
        d[c] = d[c].astype("object").where(d[c].notna(), False).astype(bool)
    for c in ["complaints", "open_items", "unanswered_outbound", "ignored_streak"]:
        d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0).astype(int)

    d["risk_score"], d["risk_reasons"] = zip(*d.apply(risk, axis=1))
    return d


def booking_dynamics(d: pd.DataFrame, bk: pd.DataFrame) -> pd.DataFrame:
    """Level is not enough. Direction, stability and how full the agenda is are what
    tell a specialist whether to act."""
    b = bk.sort_values(["doctor_id", "mp"])
    g = b.groupby("doctor_id").patient_bookings

    def slope(s):
        if len(s) < 3:
            return np.nan
        x = np.arange(len(s))
        return float(np.polyfit(x, s.values, 1)[0])

    d["bookings_slope"] = d.doctor_id.map(g.apply(slope))
    d["bookings_sd"] = d.doctor_id.map(g.std())
    d["bookings_peak"] = d.doctor_id.map(g.max())
    peak_month = b.loc[b.groupby("doctor_id").patient_bookings.idxmax()].set_index("doctor_id").mp
    last_month = b.groupby("doctor_id").mp.max()
    d["months_since_peak"] = d.doctor_id.map((last_month - peak_month).apply(lambda x: x.n))
    d["off_peak_pct"] = np.where(d.bookings_peak.gt(0),
                                 (d.bookings_last - d.bookings_peak) / d.bookings_peak, np.nan)
    tot = b.groupby("doctor_id")[["admin_bookings", "patient_bookings"]].sum()
    d["admin_share"] = d.doctor_id.map(
        tot.admin_bookings / (tot.admin_bookings + tot.patient_bookings).clip(lower=1))
    # the number that makes the hollow-calendar finding operational
    d["bookings_per_slot"] = np.where(d.weekly_slots_published.gt(0),
                                      d.bookings_avg / d.weekly_slots_published, np.nan)
    return d


def campaign_fatigue(d: pd.DataFrame, enr: pd.DataFrame, asof: pd.Timestamp) -> pd.DataFrame:
    """Kraken does not know when to stop. This measures whether it should have."""
    e = enr.sort_values(["doctor_id", "enrolled_at"])
    g = e.groupby("doctor_id")
    d["campaigns_engaged_rate"] = d.doctor_id.map(g.engaged.mean())
    d["last_enrolled_at"] = d.doctor_id.map(g.enrolled_at.max())
    d["days_since_enrollment"] = (asof - d.last_enrolled_at).dt.days
    recent = e[e.enrolled_at > asof - pd.Timedelta(days=60)]
    d["campaigns_60d"] = d.doctor_id.map(recent.groupby("doctor_id").size()).fillna(0).astype(int)
    d["over_contacted"] = d.campaigns_60d >= RULES["campaign_fatigue_n"]

    def ignored_streak(x):
        n = 0
        for v in reversed(list(x.engaged)):
            if v:
                break
            n += 1
        return n

    d["ignored_streak"] = d.doctor_id.map(
        e.groupby("doctor_id")[["engaged"]].apply(ignored_streak)).fillna(0).astype(int)
    d["responds_to"] = d.doctor_id.map(
        e[e.engaged].groupby("doctor_id").campaign_id.agg(lambda s: ",".join(sorted(set(s)))))
    d["ignores"] = d.doctor_id.map(
        e[~e.engaged].groupby("doctor_id").campaign_id.agg(lambda s: ",".join(sorted(set(s)))))
    return d


def peer_benchmark(d: pd.DataFrame) -> pd.DataFrame:
    """A doctor is not slow in the abstract. They are slow against urologists in Puebla
    who signed up the same month. This is what makes a draft persuasive."""
    d["signup_month"] = d.signup_date.dt.to_period("M").astype(str)
    for name, keys in [("specialty", ["specialty"]),
                       ("specialty_city", ["specialty", "city"]),
                       ("cohort", ["signup_month"])]:
        grp = d.groupby(keys).bookings_avg
        d[f"pct_{name}"] = grp.rank(pct=True)
        d[f"median_{name}"] = grp.transform("median")
    d["peer_gap"] = d.bookings_avg - d.median_specialty_city
    d["bottom_quartile"] = d.pct_specialty_city < RULES["peer_low_percentile"]

    # Two ways to under-perform that look identical in a bookings column and need
    # opposite interventions. See FINDINGS.md section 9.
    # The gap must be wide enough to survive being read aloud: a message that says
    # "you are on 14 and the median is 14" argues against itself.
    below = d.peer_gap <= -RULES["meaningful_peer_gap"]
    d["supply_constrained"] = (d.calendar_enabled
                               & d.weekly_slots_published.between(1, RULES["calendar_healthy_slots"])
                               & below)
    d["demand_constrained"] = (d.calendar_enabled
                               & d.weekly_slots_published.gt(RULES["calendar_healthy_slots"])
                               & below)
    return d


# Measured churn lift, computed by src/analysis.py on this dataset. Weights below
# are set from this table, not from intuition. Three signals I expected to matter
# (unanswered outbound, campaign over-contact, falling booking trend) came back at
# or below baseline and carry no weight — see FINDINGS.md section 7.
LIFT = {
    "churn_threat":      (352, 0.358, 5.45),
    "grade_D":           (900, 0.174, 2.66),
    "discouraged":       (254, 0.150, 2.28),
    "bottom_quartile":  (1074, 0.128, 1.94),
    "calendar_off":     (1340, 0.106, 1.61),
    "complaint":         (981, 0.094, 1.43),
    "grade_C":           (987, 0.082, 1.25),
    "calendar_hollow":   (870, 0.082, 1.24),
    "ignored_streak":    (243, 0.078, 1.19),
}
BASELINE_CHURN = 0.066

# The weights risk() adds, in one table so screens can show exactly how the score is
# built. key -> (points, LIFT key, plain description). Signals in the same group are
# exclusive: only the strongest one counts.
RISK_WEIGHTS = {
    "churn_threat":    (0.50, "churn_threat",    "Said they would cancel or are comparing platforms"),
    "discouraged":     (0.25, "discouraged",     "Noted as discouraged with results (only if no cancel threat)"),
    "grade_D":         (0.30, "grade_D",         "Closed onboarding at grade D"),
    "grade_C":         (0.10, "grade_C",         "Closed onboarding at grade C"),
    "bottom_quartile": (0.20, "bottom_quartile", "Bottom quartile of bookings for their specialty and city"),
    "calendar_off":    (0.18, "calendar_off",    "Online calendar never turned on"),
    "complaint":       (0.12, "complaint",       "Complained about patient volume or no-shows"),
    "calendar_hollow": (0.08, "calendar_hollow", "Calendar on but too few slots published"),
    "ignored_streak":  (0.05, "ignored_streak",  "Ignored 3 or more campaigns in a row"),
}
W = {k: v[0] for k, v in RISK_WEIGHTS.items()}


def risk(r) -> tuple[float, str]:
    """Additive, inspectable, capped at 1.0. No model — every point traces to one
    rule, and every rule earns its weight from the LIFT table above. A specialist
    who disagrees with a ranking can be shown the line and the number behind it."""
    pts, why = 0.0, []

    def add(w, msg):
        nonlocal pts
        pts += w
        why.append(msg)

    # What the doctor said, as their own specialist wrote it down. Strongest signal
    # in the file by a factor of two, and it lived in free text nobody queried.
    if r.sig_churn_threat:
        add(W["churn_threat"], "said they would cancel or are comparing platforms (36% of these churn)")
    elif r.sig_discouraged:
        add(W["discouraged"], "noted as discouraged with results (15% churn)")

    if r.complaints >= 1:
        add(W["complaint"], f"{int(r.complaints)} complaint(s) logged about patient volume or no-shows")

    # How they start predicts how they end.
    if r.onboarding_grade == "D":
        add(W["grade_D"], "closed onboarding at grade D (17% churn)")
    elif r.onboarding_grade == "C":
        add(W["grade_C"], "closed onboarding at grade C")

    # The activation step that matters.
    if not r.calendar_enabled:
        add(W["calendar_off"], "online calendar never turned on (11% churn)")
    elif r.calendar_hollow:
        add(W["calendar_hollow"], f"calendar on but only {int(r.weekly_slots_published)} slots published")

    # Against their own peers, not against the platform average.
    if r.bottom_quartile and pd.notna(r.median_specialty_city):
        add(W["bottom_quartile"], f"bottom quartile for {r.specialty} in {r.city} "
                  f"({r.bookings_avg:.0f}/mo vs {r.median_specialty_city:.0f} median)")

    if r.ignored_streak >= 3:
        add(W["ignored_streak"], f"ignored the last {int(r.ignored_streak)} campaigns in a row")

    return round(min(pts, 1.0), 2), " · ".join(why)


def escalation_features(t) -> pd.DataFrame:
    e = t["escalations"].copy()
    sp = t["specialists"].set_index("specialist_id")
    e["is_person"] = e.specialist_id.isin(sp.index)
    e["team_id"] = e.specialist_id.map(sp.team_id)
    e["within_target"] = e.minutes_to_pickup <= RULES["escalation_pickup_target_min"]
    e["pickup_bucket"] = pd.cut(e.minutes_to_pickup, [-1, 30, 60, 120, 10**6],
                                labels=["<30m", "30-60m", "60-120m", "120m+"])
    return e


def specialist_features(t, esc: pd.DataFrame, doc: pd.DataFrame) -> pd.DataFrame:
    sp = t["specialists"].copy()
    g = esc[esc.is_person].groupby("specialist_id")
    sp["escalations"] = sp.specialist_id.map(g.size()).fillna(0).astype(int)
    sp["conversion"] = sp.specialist_id.map(g.converted.mean())
    sp["median_pickup_min"] = sp.specialist_id.map(g.minutes_to_pickup.median())
    sp["pct_within_target"] = sp.specialist_id.map(g.within_target.mean())
    # The control: conversion on escalations picked up inside the target.
    fast = esc[esc.is_person & esc.within_target].groupby("specialist_id").converted.mean()
    sp["conversion_when_fast"] = sp.specialist_id.map(fast)
    p = doc.groupby("owner_specialist_id")
    sp["portfolio"] = sp.specialist_id.map(p.size()).fillna(0).astype(int)
    sp["portfolio_at_risk"] = sp.specialist_id.map(
        doc.assign(f=doc.risk_score >= 0.5).groupby("owner_specialist_id").f.sum()).fillna(0).astype(int)
    sp["portfolio_churned"] = sp.specialist_id.map(
        doc.assign(f=doc.status == "churned").groupby("owner_specialist_id").f.sum()).fillna(0).astype(int)
    return sp


def build(path: Path = DATA) -> dict:
    t = load(path)
    issues = quality(t)
    doc = doctor_features(t)
    esc = escalation_features(t)
    sp = specialist_features(t, esc, doc)
    OUT.mkdir(exist_ok=True)
    doc.to_parquet(OUT / "doctor_features.parquet")
    esc.to_parquet(OUT / "escalation_features.parquet")
    sp.to_parquet(OUT / "specialist_features.parquet")
    t["campaign_enrollments"].to_parquet(OUT / "enrollments.parquet")
    t["campaigns"].to_parquet(OUT / "campaigns.parquet")
    t["teams"].to_parquet(OUT / "teams.parquet")
    t["interactions"].to_parquet(OUT / "interactions.parquet")
    t["bookings_monthly"].to_parquet(OUT / "bookings.parquet")
    (OUT / "data_quality.json").write_text(json.dumps(issues, indent=2, ensure_ascii=False))
    (OUT / "rules.json").write_text(json.dumps(RULES, indent=2))
    return {"doctors": len(doc), "escalations": len(esc), "specialists": len(sp), "issues": issues}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="data quality only")
    a = ap.parse_args()
    if a.check:
        for i in quality(load()):
            print(f"[{i['severity']:5}] {i['check']}: {i['rows']} — {i['note']}")
        sys.exit(0)
    r = build()
    print(f"built  {r['doctors']} doctors · {r['escalations']} escalations · {r['specialists']} specialists")
    for i in r["issues"]:
        print(f"[{i['severity']:5}] {i['check']}: {i['rows']} — {i['note']}")
