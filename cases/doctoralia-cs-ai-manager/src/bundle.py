"""
THE CONTRACT. One build, one file, every screen reads it.

Nothing downstream opens the workbook. Nothing downstream recomputes. If two
screens disagree, this file is the only place that could have caused it.

    python3 src/bundle.py                        # build from data/dataset.xlsx
    python3 src/bundle.py --xlsx path/to.xlsx    # build from an uploaded file
    python3 src/bundle.py --validate path/to.xlsx
"""
from __future__ import annotations
import argparse, hashlib, json, sys, time
from datetime import datetime
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))

import pipeline as P
import notes as N
import series, spc, forecast, insight, llm, kpi
import draft as D

OUT = ROOT / "out"
CACHE = OUT / "bundles"
SCHEMA_VERSION = "1.1"

REQUIRED = {
    "doctors": ["doctor_id", "signup_date", "status", "owner_specialist_id",
                "calendar_enabled", "weekly_slots_published", "specialty", "city"],
    "onboardings": ["onboarding_id", "doctor_id", "specialist_id", "started_at",
                    "closed_at", "days_to_close", "score", "grade"],
    "campaigns": ["campaign_id", "ask"],
    "campaign_enrollments": ["enrollment_id", "doctor_id", "campaign_id", "enrolled_at",
                             "engaged", "escalated", "converted"],
    "escalations": ["escalation_id", "enrollment_id", "doctor_id", "specialist_id",
                    "escalated_at", "minutes_to_pickup", "converted", "case_linked"],
    "interactions": ["interaction_id", "doctor_id", "channel", "direction",
                     "occurred_at", "specialist_id", "note"],
    "bookings_monthly": ["doctor_id", "month", "patient_bookings", "admin_bookings"],
    "specialists": ["specialist_id", "specialist_name", "team_id", "role"],
    "teams": ["team_id", "team_name", "manager_name"],
}


def validate(path: Path) -> list[str]:
    """Named errors, not a stack trace. This is what the upload screen shows."""
    problems = []
    try:
        xl = pd.ExcelFile(path)
    except Exception as e:
        return [f"Could not open the file as an Excel workbook: {type(e).__name__}"]
    have = set(xl.sheet_names)
    for sheet, cols in REQUIRED.items():
        if sheet not in have:
            problems.append(f"Missing sheet `{sheet}`")
            continue
        try:
            got = set(pd.read_excel(path, sheet, nrows=1).columns)
        except Exception as e:
            problems.append(f"Sheet `{sheet}` could not be read: {type(e).__name__}")
            continue
        for c in cols:
            if c not in got:
                problems.append(f"Sheet `{sheet}` is missing the column `{c}`")
    return problems


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def _clean(o):
    """JSON cannot hold NaN, NaT, numpy scalars or Timestamps. Convert once here
    rather than in every consumer."""
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else round(float(o), 6)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp, datetime)):
        return None if pd.isna(o) else o.strftime("%Y-%m-%d")
    if isinstance(o, float):
        return None if np.isnan(o) else round(o, 6)
    if o is pd.NaT or (o is not None and not isinstance(o, (str, bool, int, list, dict)) and pd.isna(o)):
        return None
    return o


def frame(df: pd.DataFrame) -> list[dict]:
    return _clean(df.replace({np.nan: None}).to_dict("records"))


def build(xlsx: Path | None = None, use_llm: bool = True, cache: bool = True) -> dict:
    xlsx = Path(xlsx) if xlsx else P.DATA
    problems = validate(xlsx)
    if problems:
        raise ValueError("Workbook failed validation:\n  - " + "\n  - ".join(problems))

    h = file_hash(xlsx)
    CACHE.mkdir(parents=True, exist_ok=True)
    # The key covers the code and the rules too: editing a threshold in
    # pipeline.py or a play in draft.py must rebuild, not hand back the bundle
    # from before the edit.
    code = hashlib.sha256(json.dumps(P.RULES, sort_keys=True).encode())
    for src in sorted(Path(__file__).parent.glob("*.py")):
        code.update(src.read_bytes())
    cached = CACHE / f"{h}-{code.hexdigest()[:8]}-v{SCHEMA_VERSION}.json"
    if cache and cached.exists():
        b = json.loads(cached.read_text())
        b["meta"]["from_cache"] = True
        return b

    t0 = time.time()
    t = P.load(xlsx)
    tagged = N.tag_interactions(t["interactions"])
    doc = P.doctor_features(t)
    esc = P.escalation_features(t)
    sp = P.specialist_features(t, esc, doc)
    ser = series.build(t)
    asof = pd.Timestamp(P.RULES["extract_date"])

    b = {
        "meta": {
            "schema_version": SCHEMA_VERSION,
            "built_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "build_seconds": None,
            "source_file": xlsx.name,
            "source_sha256_16": h,
            "extract_date": P.RULES["extract_date"],
            "rules": P.RULES,
            "lift_table": {k: {"n": v[0], "churn": v[1], "lift": v[2]} for k, v in P.LIFT.items()},
            "row_counts": {k: int(len(v)) for k, v in t.items()},
            "from_cache": False,
        },
        "data_quality": P.quality(t),
        "doctors": frame(doc),
        "specialists": frame(sp),
        "escalations": frame(esc),
        "teams": frame(t["teams"]),
        "campaigns": frame(t["campaigns"]),
        "bookings": frame(t["bookings_monthly"].astype({"mp": str})),
        "interactions": frame(t["interactions"]),
        "series": ser,
        "spc": spc.build(t, ser),
        "kpi": kpi.build(t, doc, esc, ser, asof),
        "scopes": kpi.scopes(t, doc, esc, asof),
        "team": kpi.team(t, doc, esc, asof),
        "pulse": series.pulse(t, ser, P.RULES["extract_date"], ROOT / "config" / "events.csv"),
        "predict": forecast.build(t, doc, tagged, ser, asof),
        "insights": insight.build(t, doc, tagged, use_llm=use_llm),
        "llm": {"enabled": llm.enabled()[0], "reason": llm.enabled()[1],
                "estimate": insight.cost_estimate(
                    t["interactions"][["interaction_id", "note"]].dropna(subset=["note"]),
                    tagged, int((doc.status == "active").sum()))},
    }
    b["meta"]["build_seconds"] = round(time.time() - t0, 1)
    OUT.mkdir(exist_ok=True)
    txt = json.dumps(b, ensure_ascii=False)
    cached.write_text(txt)
    (OUT / "app_data.json").write_text(txt)
    return b


WATCH_FIELDS = ["doctor_id", "doctor_name", "specialty", "city", "owner_specialist_id",
                "top_signal", "days_elapsed", "lead_median", "days_of_lead_left", "overdue",
                "tier", "risk_score", "bookings_avg", "median_specialty_city", "signal_at", "quote"]
WEB_RULES = ["calendar_healthy_slots", "escalation_pickup_target_min", "peer_low_percentile",
             "stale_contact_days", "extract_date"]


def web_view(b: dict, top: int = 12) -> dict:
    """The slice of the bundle the Next.js app reads. Hundreds of KB, not 23 MB.

    Every number the controls can show is precomputed here: one KPI block per
    scope (whole book, team, specialist) and period. The browser only picks a
    block and filters the watchlist rows; it never computes a metric.
    """
    wl = b["predict"]["watchlist"]
    tiers: dict[str, int] = {}
    for w in wl:
        tiers[w["tier"]] = tiers.get(w["tier"], 0) + 1
    act = sorted((w for w in wl if w["tier"] == "act_now"),
                 key=lambda w: (w["days_of_lead_left"], -w["risk_score"]))[:top]
    keep = ["doctor_id", "doctor_name", "specialty", "city", "owner_specialist_id",
            "top_signal", "days_of_lead_left", "tier", "risk_score", "quote"]
    sp = {s["specialist_id"]: s for s in b["specialists"]}
    teams = {t["team_id"]: t["team_name"] for t in b["teams"]}
    people = [{"id": k, "name": v["specialist_name"], "team": teams.get(v["team_id"], "")}
              for k, v in sp.items() if v.get("role") == "Farming Specialist"]
    return {
        "meta": {k: b["meta"][k] for k in
                 ["built_at", "source_file", "source_sha256_16", "extract_date"]},
        "rules": {k: b["meta"]["rules"][k] for k in WEB_RULES},
        # the whole book at the default period, kept for screens that do not filter
        "kpi": b["kpi"],
        "weekly_onboardings": b["series"]["weekly"]["onboardings"],
        "periods": kpi.PERIODS,
        "specialists": sorted(people, key=lambda p: p["id"]),
        "teams": sorted({p["team"] for p in people}),
        "scopes": b["scopes"],
        # Control charts are portfolio-wide by design: a 400-doctor book has too
        # few points a day to hold limits.
        "spc": b["spc"],
        "team": b["team"],
        "pulse": b["pulse"],
        # What the AI layer would cost, and whether it is on. Live spend is in the
        # ledger on the machine that makes the calls (out/llm_ledger.db), not here.
        "cost": {
            "enabled": b["llm"]["enabled"],
            "reason": b["llm"]["reason"],
            "estimate": b["llm"]["estimate"],
            "prices": llm.PRICES,
            "batch_discount": llm.BATCH_DISCOUNT,
            "monthly_budget_usd": llm.settings().get("monthly_budget_usd"),
            "notes_total": b["meta"]["row_counts"].get("interactions"),
            "farming_specialists": sum(1 for s in b["specialists"]
                                       if s.get("role") == "Farming Specialist"),
        },
        "predict": {
            "ceiling": b["predict"]["ceiling"],
            "lead_times": b["predict"]["lead_times"],
            "day14": {k: v for k, v in b["predict"]["day14"].items() if k != "worklist"},
        },
        "watchlist": {"tiers": tiers,
                      "act_now_top": [{k: w[k] for k in keep} for w in act],
                      "items": [{k: w[k] for k in WATCH_FIELDS} for w in wl]},
    }


DOSSIER_FIELDS = ["doctor_id", "doctor_name", "specialty", "city", "status", "signup_date",
                  "churned_at", "owner_specialist_id", "onboarding_grade", "onboarding_score",
                  "closed_at_cap", "sig_onboarding_no_show", "calendar_enabled",
                  "weekly_slots_published", "bookings_avg", "bookings_per_slot",
                  "pct_specialty_city", "median_specialty_city", "days_since_contact",
                  "risk_score", "risk_reasons", "top_signal", "top_signal_at", "top_signal_note"]


def _num(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(v, 3) if isinstance(v, float) else v


def dossiers(b: dict) -> dict[str, list]:
    """One file per owner: what the doctor panel shows, with the copilot's draft.

    The draft comes from draft.compose, the same call the Streamlit card makes,
    so the web panel and the Streamlit card cannot disagree about what to send.
    """
    doc = pd.DataFrame(b["doctors"])
    names = {s["specialist_id"]: s["specialist_name"] for s in b["specialists"]}
    bk = pd.DataFrame(b["bookings"]).sort_values("month").groupby("doctor_id")
    it = (pd.DataFrame(b["interactions"]).sort_values("occurred_at", ascending=False)
          .groupby("doctor_id").head(6).groupby("doctor_id"))
    bk_d = {k: g[["month", "patient_bookings", "admin_bookings"]].to_dict("records") for k, g in bk}
    it_d = {k: g[["occurred_at", "channel", "direction", "specialist_id", "note"]]
            .to_dict("records") for k, g in it}
    out: dict[str, list] = {}
    for _, r in doc.iterrows():
        first = names.get(r.owner_specialist_id, "su especialista").split()[0]
        res = D.compose(r, first, "el jueves")
        d = {k: _num(r[k]) for k in DOSSIER_FIELDS}
        d["bookings"] = bk_d.get(r.doctor_id, [])
        d["contacts"] = it_d.get(r.doctor_id, [])
        d["copilot"] = {k: res[k] for k in
                        ["mode", "play", "why", "ask", "draft", "instead", "channel",
                         "confident", "confidence", "gaps"]}
        out.setdefault(r.owner_specialist_id, []).append(d)
    return out


def write_web_view(b: dict) -> Path:
    OUT.mkdir(exist_ok=True)
    dd = OUT / "doctors"
    dd.mkdir(exist_ok=True)
    for owner, rows in dossiers(b).items():
        (dd / f"{owner}.json").write_text(json.dumps(_clean(rows), ensure_ascii=False,
                                                     separators=(",", ":")))
    p = OUT / "overview.json"
    p.write_text(json.dumps(web_view(b), ensure_ascii=False, separators=(",", ":")))
    return p


def load_bundle(path: Path | None = None) -> dict:
    p = Path(path) if path else OUT / "app_data.json"
    if not p.exists():
        raise FileNotFoundError(f"No bundle at {p}. Run: python3 src/bundle.py")
    return json.loads(p.read_text())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx"); ap.add_argument("--validate")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--no-cache", action="store_true")
    a = ap.parse_args()
    if a.validate:
        pr = validate(Path(a.validate))
        print("VALID — all 9 sheets and every required column present" if not pr
              else "INVALID:\n  - " + "\n  - ".join(pr))
        raise SystemExit(0 if not pr else 1)
    b = build(Path(a.xlsx) if a.xlsx else None, use_llm=not a.no_llm, cache=not a.no_cache)
    m = b["meta"]
    print(f"built in {m['build_seconds']}s  ({'cache' if m['from_cache'] else 'fresh'})  "
          f"sha={m['source_sha256_16']}")
    print(f"  doctors {len(b['doctors'])}  escalations {len(b['escalations'])}  "
          f"specialists {len(b['specialists'])}")
    print(f"  spc charts {len(b['spc'])}  watchlist {len(b['predict']['watchlist'])}  "
          f"themes {len(b['insights']['rules_themes'])}")
    print(f"  data-quality findings {len(b['data_quality'])}")
    print(f"  llm: {b['llm']['reason']}   full enrichment would cost "
          f"${b['llm']['estimate']['total_usd']}")
    print(f"  bundle size {len(json.dumps(b))/1e6:.1f} MB -> out/app_data.json")
    wv = write_web_view(b)
    print(f"  web view {wv.stat().st_size/1e3:.1f} KB -> out/overview.json")
