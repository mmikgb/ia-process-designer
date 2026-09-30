"""
THE CONTRACT. One build, one file, every screen reads it.

Nothing downstream opens the workbook. Nothing downstream recomputes. If two
screens disagree, this file is the only place that could have caused it.

    python3 src/bundle.py                        # build from data/dataset.xlsx
    python3 src/bundle.py --xlsx path/to.xlsx    # build from an uploaded file
    python3 src/bundle.py --validate path/to.xlsx
"""
from __future__ import annotations
import argparse, hashlib, json, shutil, sys, time
from datetime import datetime
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))

import pipeline as P
import notes as N
import series, spc, forecast, insight, llm, kpi, dayplan
import draft as D

OUT = ROOT / "out"
CACHE = OUT / "bundles"
SCHEMA_VERSION = "1.2"
# The shape of the web view (overview.json, queue/, doctors/, search.json). Bump it whenever
# the web app starts to need a field; web/scripts/sync-data.mjs refuses to copy an out/ with
# a lower number over the committed data (a stale out/ used to break /costo silently).
WEB_SCHEMA = 4

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
        "enrollments": frame(t["campaign_enrollments"]),
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
             "stale_contact_days", "extract_date", "min_n_rate", "followup_stale_days"]


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
        "meta": {**{k: b["meta"][k] for k in
                    ["built_at", "source_file", "source_sha256_16", "extract_date"]},
                 "web_schema": WEB_SCHEMA,
                 # the cuts behind the segments bar and /doctores?risk_band=
                 "risk_bands": [{"key": k, "label": n, "lo": lo, "hi": hi}
                                for k, n, lo, hi in kpi.RISK_BANDS],
                 # search.json "a" is a bitmask over these, in this order
                 "signal_bits": [k for k, _, _ in kpi.ATTENTION],
                 # search.json "f" is a bitmask over these
                 "flag_bits": dayplan.FLAGS,
                 "asof": P.RULES["extract_date"],
                 "queue_capacity": P.RULES["daily_capacity"],
                 "followup_quota": P.RULES["daily_followup_quota"],
                 # priority order comes from PLAYS: the UI can say so, and show it
                 "plays": [{"key": p["key"], "mode": p["mode"], "label": p["label"]}
                           for p in D.PLAYS]},
        "rules": {k: b["meta"]["rules"][k] for k in WEB_RULES},
        # the whole book at the default period, kept for screens that do not filter
        "kpi": b["kpi"],
        "weekly_onboardings": b["series"]["weekly"]["onboardings"],
        "periods": kpi.PERIODS,
        "specialists": sorted(people, key=lambda p: p["id"]),
        "teams": sorted({p["team"] for p in people}),
        "managers": [{"team": t["team_name"], "name": t["manager_name"]} for t in b["teams"]
                     if t["team_name"] in {p["team"] for p in people}],
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
            "usage_v2": llm.usage_estimate(sum(1 for s in b["specialists"]
                                               if s.get("role") == "Farming Specialist")),
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
                  "risk_score", "top_signal", "top_signal_at", "top_signal_note",
                  "onboarding_closed_at", "calendar_enabled_at"]
# Web size budget (SPEC T1.7: web/public data < 20 MB). Nothing below loses information:
# the English copilot texts live inside copilot.i18n, risk reasons inside
# risk_reasons_i18n, and contacts_all is written only when it adds to contacts.
CONTACTS_PANEL = 6


def _num(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(v, 3) if isinstance(v, float) else v


def _groups(rows: list[dict], key: str = "doctor_id") -> dict[str, list[dict]]:
    g: dict[str, list[dict]] = {}
    for r in rows:
        g.setdefault(r[key], []).append(r)
    return g


def web_doctors(b: dict) -> tuple[pd.DataFrame, dict, dict, dict]:
    """The doctor rows as the web files see them, with the copilot output and the
    flags computed once, so dossiers, queues and search cannot disagree."""
    doc = pd.DataFrame(b["doctors"])
    names = {s["specialist_id"]: s["specialist_name"] for s in b["specialists"]}
    asof = pd.Timestamp(P.RULES["extract_date"])
    copilot, flags = {}, {}
    for _, r in doc.iterrows():
        first = names.get(r.owner_specialist_id, "su especialista").split()[0]
        copilot[r.doctor_id] = D.compose(r, first)
        flags[r.doctor_id] = dayplan.flags(r, P.RULES, asof)
    return doc, names, copilot, flags


def dossiers(b: dict, doc: pd.DataFrame, copilot: dict, flags: dict) -> dict[str, list]:
    """One file per owner: what the doctor panel shows, with the copilot's draft.

    The draft comes from draft.compose, the same call the Streamlit card makes,
    so the web panel and the Streamlit card cannot disagree about what to send.
    """
    bk = pd.DataFrame(b["bookings"]).sort_values("month").groupby("doctor_id")
    bk_d = {k: g[["month", "patient_bookings", "admin_bookings"]].to_dict("records") for k, g in bk}
    cols = ["occurred_at", "channel", "direction", "specialist_id", "note"]
    it = (pd.DataFrame(b["interactions"]).sort_values(["occurred_at", "interaction_id"],
                                                      ascending=False))
    it_d = {k: g[cols].to_dict("records") for k, g in it.groupby("doctor_id", sort=False)}
    camp = {c["campaign_id"]: c.get("ask") for c in b["campaigns"]}
    enr_d = _groups(sorted(b.get("enrollments", []), key=lambda e: e["enrolled_at"] or "",
                           reverse=True))
    esc_d = _groups(sorted(b["escalations"], key=lambda e: e["escalated_at"] or "", reverse=True))
    out: dict[str, list] = {}
    for _, r in doc.iterrows():
        res = copilot[r.doctor_id]
        d = {k: _num(r[k]) for k in DOSSIER_FIELDS}
        d["bookings"] = bk_d.get(r.doctor_id, [])
        d["bookings_last"] = _num(r.bookings_last)
        d["bookings_prev"] = _num(r.bookings_prev)
        allc = it_d.get(r.doctor_id, [])
        d["contacts"] = allc[:CONTACTS_PANEL]
        if len(allc) > CONTACTS_PANEL:          # absent = contacts is already every contact
            d["contacts_all"] = allc
        # `converted` is empty for ~95% of enrollments: null means "no recorded outcome",
        # never "no". The campaigns sheet has no name column; `ask` is its description.
        d["campaigns"] = [{"campaign_id": e["campaign_id"], "name": camp.get(e["campaign_id"]),
                           "enrolled_at": e["enrolled_at"], "engaged": e["engaged"],
                           "converted": e["converted"]} for e in enr_d.get(r.doctor_id, [])]
        d["escalations"] = [{"escalated_at": e["escalated_at"],
                             "minutes_to_pickup": e["minutes_to_pickup"],
                             "converted": e["converted"], "handler": e["specialist_id"]}
                            for e in esc_d.get(r.doctor_id, [])]
        d["followup"] = ({"due_at": r.followup_due_at, "kind": r.followup_kind,
                          "note": r.followup_note, "set_at": r.followup_set_at,
                          "set_by": r.followup_set_by}
                         if isinstance(r.followup_due_at, str) else None)
        d["flags"] = flags[r.doctor_id]
        d["risk_reasons_i18n"] = r.risk_reasons_i18n if isinstance(r.risk_reasons_i18n, list) else []
        d["copilot"] = {k: res[k] for k in
                        ["mode", "play", "draft", "confident", "confidence", "i18n"]}
        out.setdefault(r.owner_specialist_id, []).append(d)
    return out


# Short keys keep search.json under 1 MB; the mapping is SearchRowRaw in web/lib/types.ts.
SEARCH_KEYS = {"id": "i", "name": "n", "specialty": "s", "city": "c", "owner": "o",
               "status": "st", "play": "p", "mode": "m", "risk": "r", "flags": "f",
               "last_contact": "lc", "followup": "fu", "signals": "a"}


def search_rows(doc: pd.DataFrame, copilot: dict, flags: dict) -> list[dict]:
    """One row per doctor for the command palette and the /doctores list (§5.2).

    Short keys and bitmasks keep the file under 1 MB; web/lib/types.ts searchRow() decodes
    them with meta.flag_bits and meta.signal_bits."""
    # Compact, to keep the file under 1 MB: dates as days from the data date (last contact
    # in the past is positive, a follow-up due later is positive), and the attention
    # signals as a bitmask in kpi.ATTENTION order (bit 0 = the first signal).
    att = kpi.attention_masks(doc)
    bits = {k: 1 << n for n, (k, _, _) in enumerate(kpi.ATTENTION)}
    signals = {i: sum(b for k, b in bits.items() if att[k].iat[n])
               for n, i in enumerate(doc.doctor_id)}
    asof = pd.Timestamp(P.RULES["extract_date"])

    def days(v, sign):
        if not isinstance(v, str) or not v:
            return None
        return int(sign * (pd.Timestamp(v[:10]) - asof).days)
    rows = [{"id": r.doctor_id, "name": r.doctor_name, "specialty": r.specialty, "city": r.city,
             "owner": r.owner_specialist_id, "status": r.status,
             "play": copilot[r.doctor_id]["play"], "mode": copilot[r.doctor_id]["mode"],
             "risk": _num(r.risk_score),
             "flags": sum(1 << dayplan.FLAGS.index(f) for f in flags[r.doctor_id]),
             "last_contact": days(r.last_contact, -1), "followup": days(r.followup_due_at, 1),
             "signals": signals[r.doctor_id]}
            for _, r in doc.iterrows()]
    # the three optional fields are left out when empty: the file is read on every screen
    # "st" is written only for churned doctors (absent = active).
    optional = {"last_contact", "followup", "signals"}
    return [{SEARCH_KEYS[k]: v for k, v in x.items()
             if not (k in optional and v in (None, 0)) and not (k == "status" and v == "active")}
            for x in rows]


def _dump(path: Path, obj) -> None:
    path.write_text(json.dumps(_clean(obj), ensure_ascii=False, separators=(",", ":")))


def write_web_view(b: dict) -> dict:
    """Writes every web file into out/ and, when web/ sits next door, into the app,
    so a running `pnpm dev` hot-reloads after a rebuild: edit a rule, rebuild, the
    page moves. Returns the paths and the queues (for the size report)."""
    OUT.mkdir(exist_ok=True)
    doc, names, copilot, flags = web_doctors(b)

    dd = OUT / "doctors"
    shutil.rmtree(dd, ignore_errors=True)
    dd.mkdir()
    for owner, rows in dossiers(b, doc, copilot, flags).items():
        _dump(dd / f"{owner}.json", rows)

    qd = OUT / "queue"
    shutil.rmtree(qd, ignore_errors=True)
    qd.mkdir()
    queues = dayplan.build(doc, b["predict"]["watchlist"], P.RULES, P.RULES["extract_date"],
                           copilot, names)
    for owner, q in queues.items():
        _dump(qd / f"{owner}.json", q)

    sp = OUT / "search.json"
    _dump(sp, search_rows(doc, copilot, flags))
    p = OUT / "overview.json"
    p.write_text(json.dumps(web_view(b), ensure_ascii=False, separators=(",", ":")))

    web = ROOT / "web"
    if web.is_dir():
        (web / "data").mkdir(exist_ok=True)
        shutil.copyfile(p, web / "data" / "overview.json")
        for name in ["doctors", "queue"]:
            shutil.rmtree(web / "public" / name, ignore_errors=True)
            shutil.copytree(OUT / name, web / "public" / name)
        shutil.copyfile(sp, web / "public" / "search.json")
    return {"overview": p, "search": sp, "queues": queues}


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
    print(f"  web view {wv['overview'].stat().st_size/1e3:.1f} KB -> out/overview.json"
          + (" (and web/data, web/public)" if (ROOT / "web").is_dir() else ""))
    print(f"  search {wv['search'].stat().st_size/1e3:.1f} KB -> out/search.json")
    print(f"\n  the day per specialist (capacity {P.RULES['daily_capacity']}, follow-up quota "
          f"{P.RULES['daily_followup_quota']}, stale after {P.RULES['followup_stale_days']} days)")
    print("  owner  | before capacity: call followup message handoff later "
          "| today: call followup message handoff | later (past lead, over capacity)")
    for s in dayplan.summary(wv["queues"]):
        print(f"  {s['owner']:6} | {s['call_all']:4} {s['followup_all']:8} {s['message_all']:7} "
              f"{s['handoff_all']:7} {s['later_all']:5} | {s['call_today']:4} "
              f"{s['followup_today']:8} {s['message_today']:7} {s['handoff_today']:7} | "
              f"{s['later']:4} ({s['later_past_lead']}, {s['later_capacity']})")
    pub = ROOT / "web" / "public"
    if pub.is_dir():
        size = sum(f.stat().st_size for f in pub.rglob("*.json"))
        print(f"\n  web/public data {size/1e6:.1f} MB")
