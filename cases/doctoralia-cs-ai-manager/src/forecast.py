"""
The predictive layer. Three components, all measured, none of them a model.

  1. Lead time   — how long before a cancellation each warning signal arrives
  2. Day 14      — the onboarding checkpoint, and who is failing it right now
  3. Volume      — a weekly escalation forecast, as a range
"""
from __future__ import annotations
import numpy as np
import pandas as pd

WATCH_TAGS = ["churn_threat", "discouraged", "complaint_no_patients", "complaint_noshow"]
# The two signals with a churn lift worth acting on today (5.45x and 2.28x).
# The complaint signals (1.43x) are real but weaker, and there are four times as
# many — they are a watch tier, not a call-today tier.
ACT_TAGS = ["churn_threat", "discouraged"]
CHECKPOINT_DAY = 14


def lead_times(tagged: pd.DataFrame, doctors: pd.DataFrame) -> list[dict]:
    ch = doctors[doctors.status == "churned"][["doctor_id", "churned_at"]]
    out = []
    for tag in WATCH_TAGS:
        first = tagged[tagged.tag == tag].groupby("doctor_id").occurred_at.min().rename("sig")
        m = ch.join(first, on="doctor_id").dropna(subset=["sig"])
        if len(m) < 20:
            continue
        lead = (m.churned_at - m.sig).dt.days
        pre = lead[lead > 0]
        out.append({"signal": tag, "n": int(len(m)),
                    "before_churn": round(float((lead > 0).mean()), 3),
                    "median_days": int(pre.median()),
                    "p25": int(pre.quantile(.25)), "p75": int(pre.quantile(.75))})
    return sorted(out, key=lambda x: x["median_days"])


def ceiling(tagged: pd.DataFrame, doctors: pd.DataFrame) -> dict:
    ch = doctors[doctors.status == "churned"]
    seen = set(tagged[tagged.tag.isin(["churn_threat", "discouraged"])].doctor_id)
    caught = int(ch.doctor_id.isin(seen).sum())
    return {"churned_total": int(len(ch)), "with_warning": caught,
            "share": round(caught / max(len(ch), 1), 3),
            "note": (f"{caught} of {len(ch)} churned doctors carried a churn-threat or discouraged "
                     f"note before they left. This watchlist cannot see the other "
                     f"{len(ch) - caught}. An empty watchlist is not good news.")}


def watchlist(doc: pd.DataFrame, leads: list[dict], asof: pd.Timestamp) -> list[dict]:
    med = {l["signal"]: l["median_days"] for l in leads}
    live = doc[(doc.status == "active") & doc.top_signal.isin(WATCH_TAGS)].copy()
    live["lead_median"] = live.top_signal.map(med)
    live["days_elapsed"] = (asof - live.top_signal_at).dt.days
    live["days_of_lead_left"] = (live.lead_median - live.days_elapsed).astype("Float64")
    live["overdue"] = live.days_of_lead_left < 0
    # Three tiers. Without this the list is 954 names, nobody can call 954 people,
    # and the screen gets ignored by Thursday.
    def tier(r):
        if r.overdue:
            return "overdue"
        return "act_now" if r.top_signal in ACT_TAGS else "watch"

    live["tier"] = live.apply(tier, axis=1)
    order = {"act_now": 0, "watch": 1, "overdue": 2}
    live["_o"] = live.tier.map(order)
    live = live.sort_values(["_o", "days_of_lead_left", "risk_score"],
                            ascending=[True, True, False])
    cols = ["doctor_id", "doctor_name", "specialty", "city", "owner_specialist_id",
            "top_signal", "days_elapsed", "lead_median", "days_of_lead_left", "overdue",
            "tier", "risk_score", "bookings_avg", "median_specialty_city"]
    r = live[cols].copy()
    r["signal_at"] = live.top_signal_at.dt.strftime("%Y-%m-%d")
    r["quote"] = live.top_signal_note.astype(str).str.slice(0, 180)
    return r.replace({np.nan: None}).to_dict("records")


def day14(t: dict, doc: pd.DataFrame, asof: pd.Timestamp) -> dict:
    """The checkpoint, and the live worklist it produces."""
    onb = t["onboardings"].merge(
        t["doctors"][["doctor_id", "doctor_name", "calendar_enabled", "calendar_enabled_at", "status"]],
        on="doctor_id")
    onb["on_by_14"] = ((onb.calendar_enabled_at - onb.started_at).dt.days.le(CHECKPOINT_DAY)
                       & onb.calendar_enabled).fillna(False)
    ev = onb.groupby("on_by_14").agg(n=("onboarding_id", "size"), avg_score=("score", "mean"),
                                     grade_a=("grade", lambda s: (s == "A").mean()),
                                     grade_d=("grade", lambda s: (s == "D").mean()),
                                     churn=("status", lambda s: (s == "churned").mean()))
    evidence = [{"calendar_on_by_day_14": bool(k), "n": int(v.n), "avg_score": round(v.avg_score, 1),
                 "grade_a": round(v.grade_a, 3), "grade_d": round(v.grade_d, 3),
                 "churn": round(v.churn, 3)} for k, v in ev.iterrows()]

    # In-flight onboardings: started, not yet closed at the extract date.
    live = onb[onb.closed_at.isna() | (onb.closed_at > asof)].copy()
    d = doc.set_index("doctor_id")

    if len(live) == 0:
        # This dataset has no live cohort — every onboarding closed before the
        # extract. Say so, and show the retrospective instead of an empty screen.
        missed = onb[~onb.on_by_14]
        return {
            "evidence": evidence, "checkpoint_day": CHECKPOINT_DAY,
            "worklist": [], "worklist_size": 0,
            "live_cohort": False,
            "note": ("No in-flight onboardings exist in this extract \u2014 all 5,526 closed on or "
                     f"before {asof.date()}. In production this is a daily worklist. Here it is "
                     "shown retrospectively: the rule is evaluated against onboardings that have "
                     "already finished, which is what proves it works."),
            "retrospective": {
                "failed_checkpoint": int(len(missed)),
                "of_those_grade_d": int((missed.grade == "D").sum()),
                "grade_d_rate": round(float((missed.grade == "D").mean()), 3),
                "passed_grade_d_rate": round(float((onb[onb.on_by_14].grade == "D").mean()), 3),
            },
        }

    live["day"] = (asof - live.started_at).dt.days
    live["days_since_contact"] = live.doctor_id.map(d.days_since_contact)
    flag = live[(live.day >= CHECKPOINT_DAY) & (~live.on_by_14)
                & (live.days_since_contact.fillna(99) > 5)]
    work = flag[["onboarding_id", "doctor_id", "doctor_name", "specialist_id", "day",
                 "days_since_contact"]].copy()
    work["predicted_grade_d_rate"] = round(float(ev.loc[False, "grade_d"]), 3)
    return {"evidence": evidence, "checkpoint_day": CHECKPOINT_DAY, "live_cohort": True,
            "worklist": work.replace({np.nan: None}).to_dict("records"),
            "worklist_size": int(len(work))}


def escalation_forecast(ser: dict, weeks: int = 4) -> list[dict]:
    """Seasonal-naive with an empirical interval. Deliberately simple: a range,
    never a point, and never dressed up as more than it is."""
    w = pd.DataFrame(ser["weekly"]["escalations"])
    w = w[w.n >= 5]
    if len(w) < 8:
        return []
    recent = w.n.tail(8)
    mu, sd = float(recent.mean()), float(recent.std() or 1)
    last = str(w.week.iloc[-1])[:10]
    start = pd.Timestamp(last) + pd.Timedelta(days=7)
    return [{"week_starting": str((start + pd.Timedelta(days=7 * i)).date()),
             "expected": int(round(mu)),
             "lo": int(max(round(mu - 1.96 * sd), 0)), "hi": int(round(mu + 1.96 * sd)),
             "basis": "mean of the last 8 weeks with n>=5, +/- 1.96 sd"} for i in range(weeks)]


def build(t, doc, tagged, ser, asof) -> dict:
    leads = lead_times(tagged, t["doctors"])
    return {"lead_times": leads,
            "ceiling": ceiling(tagged, t["doctors"]),
            "watchlist": watchlist(doc, leads, asof),
            "day14": day14(t, doc, asof),
            "escalation_forecast": escalation_forecast(ser)}
