"""
CS Control Room.   streamlit run src/app.py

One app, two roles, six screens, one bundle. No screen computes anything: if a
number is not in out/app_data.json it cannot be shown.
"""
from __future__ import annotations
import json, sys, time
from pathlib import Path
import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))
import bundle as B
import charts as C
import draft as D
import viz as V
import llm
import state as S
from i18n import en

ROOT = Path(__file__).resolve().parent.parent
st.set_page_config(page_title="CS Control Room", layout="wide", page_icon="◆")
st.markdown("""<style>
:root{--bar:#0d8159;--mut:#5f6f68;--warn:#8a5d00;--bg:#fff}
@media (prefers-color-scheme:dark){:root{--bar:#22a87c;--mut:#98a8a1;--warn:#d9a441;--bg:#0e1117}}
.chart{margin:2px 0 10px}
[data-testid="stMetricValue"]{font-size:1.45rem}
.block-container{padding-top:2.2rem}
</style>""", unsafe_allow_html=True)


@st.cache_data(show_spinner="Loading the bundle…")
def load(path: str, mtime: float):
    b = B.load_bundle(Path(path))
    return b, pd.DataFrame(b["doctors"]), pd.DataFrame(b["specialists"]), \
        pd.DataFrame(b["escalations"]), pd.DataFrame(b["bookings"]), pd.DataFrame(b["interactions"])


BUNDLE = ROOT / "out" / "app_data.json"
if not BUNDLE.exists():
    st.title("CS Control Room")
    st.warning("No bundle yet. Build one from the Data screen, or run `python3 src/bundle.py`.")
    up = st.file_uploader("Workbook (.xlsx)", type=["xlsx"])
    if up:
        tmp = ROOT / "out" / "_upload.xlsx"
        tmp.parent.mkdir(exist_ok=True); tmp.write_bytes(up.getbuffer())
        probs = B.validate(tmp)
        if probs:
            st.error("This workbook cannot be used:")
            for p in probs: st.write("• " + p)
        else:
            with st.spinner("Building…"):
                B.build(tmp)
            st.rerun()
    st.stop()

b, DOC, SPEC, ESC, BK, INTER = load(str(BUNDLE), BUNDLE.stat().st_mtime)
M = b["meta"]
RULES = M["rules"]

# ── sidebar ────────────────────────────────────────────────────────────────
st.sidebar.markdown("### CS Control Room")
role = st.sidebar.radio("View as", ["Specialist", "Manager"], horizontal=True)
farmers = SPEC[SPEC.role == "Farming Specialist"].sort_values("specialist_id")
teams = pd.DataFrame(b["teams"])

if role == "Specialist":
    who = st.sidebar.selectbox("Specialist", farmers.specialist_id.tolist(),
                               format_func=lambda k: f"{k} · {farmers.set_index('specialist_id').loc[k,'specialist_name']}")
    team = farmers.set_index("specialist_id").loc[who, "team_id"]
    screens = ["Overview", "My day", "Watchlist", "Doctor", "Data & settings"]
else:
    team = st.sidebar.selectbox("Team", teams[teams.team_id != "T4"].team_id.tolist(),
                                format_func=lambda t: f"{t} · {teams.set_index('team_id').loc[t,'team_name']}")
    who = None
    screens = ["Overview", "My team", "Control", "Watchlist", "Cost", "Doctor",
               "Data & settings"]

screen = st.sidebar.radio("Screen", screens, label_visibility="collapsed")
age_h = (time.time() - BUNDLE.stat().st_mtime) / 3600
st.sidebar.caption(f"Built {M['built_at']}" + ("  ⚠ stale" if age_h > 24 else ""))
st.sidebar.caption(f"`{M['source_file']}` · sha {M['source_sha256_16']}")
ai_ok, ai_why = llm.enabled()
st.sidebar.caption(("🟢 AI on" if ai_ok else f"⚪ AI off — {ai_why}"))

if "focus" not in st.session_state:
    st.session_state.focus = DOC.doctor_id.iloc[0]


def goto(doctor_id, scr="Doctor"):
    st.session_state.focus = doctor_id


def card(r, key, specialist_name="su especialista"):
    res = D.compose(r, specialist_name.split()[0])
    done = S.is_done(r.doctor_id)
    with st.container(border=True):
        a, c2 = st.columns([4, 1])
        with a:
            st.markdown(f"**{r.doctor_name}** · {r.specialty} · {r.city}"
                        + ("  ✅" if done else ""))
            peer = (f" vs {r.median_specialty_city:.0f} median"
                    if pd.notna(r.median_specialty_city) else "")
            st.caption(f"{r.doctor_id} · grade {r.onboarding_grade or '—'} · "
                       f"{(r.bookings_avg or 0):.0f} bookings/mo{peer}")
            st.markdown(f"**Why now:** {r.risk_reasons or 'no active signal'}")
        with c2:
            st.metric("Risk", f"{r.risk_score:.2f}")
            st.caption({"draft": "✎ draft", "brief": "☎ call", "handoff": "→ route"}
                       .get(res["mode"], "—"))
        if res["channel"]:
            st.caption("⚑ " + res["channel"])
        if pd.notna(r.top_signal_note) and r.top_signal not in (None, "positive"):
            st.caption(f"*“{str(r.top_signal_note)[:170]}”* — {r.top_signal_at}")
        if res["confident"]:
            st.caption(res["why"])
            st.text_area("Draft", res["draft"], key=f"t{key}", height=120,
                         label_visibility="collapsed")
        elif res["mode"] == "brief":
            st.error("**Not a message.** " + res["why"])
            st.code(res["instead"], language=None)
        elif res["mode"] == "handoff":
            st.info(res["instead"])
        else:
            st.warning(res["instead"])
        x, y, z = st.columns(3)
        if x.button("Done", key=f"d{key}"): S.mark(r.doctor_id, "done"); st.rerun()
        if y.button("Snooze 7d", key=f"s{key}"): S.mark(r.doctor_id, "snooze", 7); st.rerun()
        if z.button("Open", key=f"o{key}"): goto(r.doctor_id); st.rerun()


DARK = st.get_option("theme.base") == "dark"
PAL = V.pal(DARK)


def kpi_row(kpis, cols=4):
    for i in range(0, len(kpis), cols):
        cs = st.columns(cols, gap="small")
        for c, k in zip(cs, kpis[i:i + cols]):
            c.markdown(V.kpi_card(k, DARK), unsafe_allow_html=True)
        st.write("")


# ── screens ────────────────────────────────────────────────────────────────
if screen == "Overview":
    K = b["kpi"]
    who_name = (SPEC.set_index("specialist_id").loc[who, "specialist_name"].split()[0]
                if who else teams.set_index("team_id").loc[team, "manager_name"].split()[0])
    st.title(f"Welcome back, {who_name}")
    st.caption(f"{K['totals']['active']:,} active doctors · {K['totals']['specialists']} farming "
               f"specialists · data as of {K['asof']} · deltas are the last "
               f"{K['window_days']} days against the {K['window_days']} before")

    left, right = st.columns([2, 1], gap="medium")
    with left:
        with st.container(border=True):
            st.caption("Portfolio health score")
            a, bcol = st.columns([1, 2])
            a.markdown(f"<div style='font-size:46px;font-weight:650;letter-spacing:-.03em;"
                       f"line-height:1.1;color:{PAL['ink']}'>{K['health_score']}</div>",
                       unsafe_allow_html=True)
            bcol.caption(K["health_note"])
            w = pd.DataFrame(b["series"]["weekly"]["onboardings"])
            wk = [x[:10] for x in w.week]
            st.plotly_chart(V.area(wk, [("Activated (A/B)", w.activated.tolist()),
                                        ("Struggling (C/D)", w.struggling.tolist())],
                                   dark=DARK, stack=True, height=280,
                                   ytitle="onboardings closed"),
                            use_container_width=True, key="ov_area")
            st.caption("Onboardings closed per week, split by how they closed. Two series, same "
                       "unit, summing to the total — the only case where stacking is honest.")
    with right:
        with st.container(border=True):
            st.caption("Portfolio by risk band")
            st.plotly_chart(V.segments(K["segments"], DARK), use_container_width=True,
                            key="ov_seg")
            for sg, col in zip(K["segments"], [PAL["bar"], PAL["bar"], PAL["alt"], PAL["alt"]]):
                c1, c2, c3 = st.columns([3, 2, 2])
                c1.markdown(f"<span style='color:{col}'>●</span> {sg['band']}",
                            unsafe_allow_html=True)
                c2.markdown(f"**{sg['n']:,}**")
                c3.markdown(f"{sg['share']:.0%}")
        with st.container(border=True):
            st.caption("Data sources")
            st.markdown(f"**{M['source_file']}** · sha `{M['source_sha256_16']}`")
            for k_, v_ in list(M["row_counts"].items())[:5]:
                st.caption(f"{k_}: {v_:,}")
            st.caption(("🟢 AI enrichment on" if ai_ok else f"⚪ AI off — {ai_why}"))

    st.subheader("Key metrics")
    kpi_row(K["kpis"], 4)

    st.subheader("Accounts requiring attention")
    ac, bc = st.columns([3, 2], gap="medium")
    with ac:
        for a_ in K["attention"]:
            with st.container(border=True):
                x, y, z = st.columns([5, 2, 2])
                x.markdown(f"**{a_['label']}**")
                x.caption(f"{a_['active']:,} active · {a_['doctors']:,} in total")
                y.markdown(f"<div style='font-size:19px;font-weight:650;color:{PAL['ink']}'>"
                           f"{a_['lift']}×</div><div style='font-size:11px;color:{PAL['mut']}'>"
                           f"churn lift</div>", unsafe_allow_html=True)
                z.markdown(f"<div style='font-size:19px;font-weight:650;color:{PAL['ink']}'>"
                           f"{a_['churn']:.0%}</div><div style='font-size:11px;color:{PAL['mut']}'>"
                           f"churn rate</div>", unsafe_allow_html=True)
        st.caption("Ranked by measured churn lift against the 6.6% baseline, not by size. "
                   "Every lift is recomputed on each build by `src/analysis.py`.")
    with bc:
        with st.container(border=True):
            st.caption("Farming specialists")
            f = SPEC[SPEC.role == "Farming Specialist"].copy()
            f["at_risk"] = [int((DOC[(DOC.owner_specialist_id == s) &
                                     (DOC.status == "active")].risk_score >= .5).sum())
                            for s in f.specialist_id]
            for _, r_ in f.sort_values("at_risk", ascending=False).head(8).iterrows():
                c1, c2 = st.columns([3, 2])
                c1.markdown(f"**{r_.specialist_name}**")
                c1.caption(f"{r_.team_id} · {int(r_.portfolio)} accounts")
                c2.markdown(f"<div style='text-align:right;font-size:15px;font-weight:600'>"
                            f"{r_.at_risk}</div><div style='text-align:right;font-size:11px;"
                            f"color:{PAL['mut']}'>at risk</div>", unsafe_allow_html=True)
        with st.container(border=True):
            st.caption("Escalation conversion by pickup latency")
            bk = [(x, ESC[ESC.pickup_bucket == x].converted.mean())
                  for x in ["<30m", "30-60m", "60-120m", "120m+"]
                  if (ESC.pickup_bucket == x).sum() >= 10]
            st.plotly_chart(V.hbars(bk, DARK), use_container_width=True, key="ov_bk")

elif screen == "My day":
    me = SPEC.set_index("specialist_id").loc[who]
    mine = DOC[(DOC.owner_specialist_id == who) & (DOC.status == "active")].copy()
    st.title("My day")
    st.caption(f"{me.specialist_name} · {len(mine)} active doctors · data as of {M['extract_date']}")
    mk = [
        {"label": "Said they may cancel", "value": int(mine.sig_churn_threat.sum()), "prev": None,
         "delta_pct": None, "fmt": "{:,.0f}", "good": "down", "spark": [],
         "note": "36% of these churn — call, do not message"},
        {"label": "At risk ≥ 0.50", "value": int((mine.risk_score >= .5).sum()), "prev": None,
         "delta_pct": None, "fmt": "{:,.0f}", "good": "down", "spark": [],
         "note": f"{(mine.risk_score >= .5).mean():.0%} of your portfolio"},
        {"label": "Not being found", "value": int(mine.demand_constrained.sum()), "prev": None,
         "delta_pct": None, "fmt": "{:,.0f}", "good": "down", "spark": [],
         "note": "slots to spare, still below their peers"},
        {"label": "Open commitments", "value": int(mine.commitment_open.sum()), "prev": None,
         "delta_pct": None, "fmt": "{:,.0f}", "good": "down", "spark": [],
         "note": "they promised something and nothing moved"},
        {"label": "Median escalation pickup",
         "value": None if pd.isna(me.median_pickup_min) else float(me.median_pickup_min),
         "prev": 30.0, "delta_pct": None if pd.isna(me.median_pickup_min)
         else float((me.median_pickup_min - 30) / 30), "fmt": "{:.0f} min", "good": "down",
         "spark": [], "note": "target is 30 minutes"},
    ]
    kpi_row(mk, 5)
    if pd.notna(me.median_pickup_min) and me.median_pickup_min > 30:
        st.warning(f"Your escalations wait a median of {me.median_pickup_min:.0f} minutes. Team-wide, "
                   f"those answered inside 30 minutes convert at 54%; after two hours, 14%. Your own "
                   f"conversion inside 30 minutes is {me.conversion_when_fast:.0%} — the same as "
                   "everyone else's. The queue is the problem, not the conversation.")
    f1, f2, f3 = st.columns([2, 2, 1])
    plays = ["all", "churn_threat", "open_commitment", "hollow_calendar", "visibility",
             "complaint_no_patients", "calendar_off", "grade_d_recovery", "upsell_lead"]
    pick = f1.selectbox("Play", plays)
    n = f2.slider("Accounts", 5, 40, 12)
    hide = f3.checkbox("Hide done", True)
    q = mine.sort_values("risk_score", ascending=False)
    if hide:
        q = q[~q.doctor_id.isin(S.hidden())]
    rows, seen = [], 0
    for _, r in q.iterrows():
        res = D.compose(r)
        if pick != "all" and res["play"] != pick:
            continue
        rows.append(r); seen += 1
        if seen >= n: break
    if not rows:
        st.success("Nothing matches. Spend the hour on proactive calls.")
    for r in rows:
        card(r, r.doctor_id, me.specialist_name)

elif screen == "My team":
    ids = set(SPEC[(SPEC.team_id == team) & (SPEC.role == "Farming Specialist")].specialist_id)
    mine = DOC[DOC.owner_specialist_id.isin(ids) & (DOC.status == "active")]
    et = ESC[ESC.specialist_id.isin(ids)]
    tn = teams.set_index("team_id").loc[team]
    st.title(tn.team_name)
    st.caption(f"{tn.manager_name} · {len(ids)} specialists · {len(mine)} active doctors")
    fast = ESC[ESC.within_target]
    st.info(f"Escalations answered inside {RULES['escalation_pickup_target_min']} minutes convert at "
            f"{fast.converted.mean():.0%}; after two hours, "
            f"{ESC[ESC.pickup_bucket=='120m+'].converted.mean():.0%}. That gap, not conversation "
            "quality, is where conversion goes.")
    st.subheader("Escalation pickup")
    rowsd = []
    for sid in sorted(ids):
        x = et[et.specialist_id == sid]
        nm = SPEC.set_index("specialist_id").loc[sid, "specialist_name"].split()[0]
        if len(x) < 10:
            rowsd.append({"Specialist": f"{sid} · {nm}", "Escalations": len(x),
                          "Median pickup": f"{x.minutes_to_pickup.median():.0f}m" if len(x) else "—",
                          "Inside 30m": "—", "Converted": "—", "When fast": "n<10"})
            continue
        rowsd.append({"Specialist": f"{sid} · {nm}", "Escalations": len(x),
                      "Median pickup": f"{x.minutes_to_pickup.median():.0f}m",
                      "Inside 30m": f"{x.within_target.mean():.0%}",
                      "Converted": f"{x.converted.mean():.0%}",
                      "When fast": f"{x[x.within_target].converted.mean():.0%}"
                      if x.within_target.any() else "—"})
    st.dataframe(pd.DataFrame(rowsd), hide_index=True, width="stretch")
    st.caption("The last two columns are the point: the spread in Converted disappears in When fast. "
               "Anyone under 10 escalations gets a count and no percentage.")
    buckets = ["<30m", "30-60m", "60-120m", "120m+"]
    br = [(bk, ESC[ESC.pickup_bucket == bk].converted.mean()) for bk in buckets
          if (ESC.pickup_bucket == bk).sum() >= 10]
    st.plotly_chart(V.hbars(br, DARK), use_container_width=True, key="team_bk")
    st.subheader("Work available this week")
    wr = []
    for sid in sorted(ids):
        p = mine[mine.owner_specialist_id == sid]
        wr.append({"Specialist": sid, "Portfolio": len(p),
                   "May cancel": int(p.sig_churn_threat.sum()),
                   "At risk": int((p.risk_score >= .5).sum()),
                   "Agenda too thin": int(p.calendar_hollow.sum()),
                   "Not being found": int(p.demand_constrained.sum()),
                   "Open commitments": int(p.commitment_open.sum())})
    st.dataframe(pd.DataFrame(wr), hide_index=True, width="stretch")
    dem = mine[mine.demand_constrained]
    st.caption(f"**Agenda too thin** — fewer than {RULES['calendar_healthy_slots']} slots published; "
               f"the fix is to open more. **Not being found** — {len(dem)} doctors averaging "
               f"{dem.weekly_slots_published.mean():.0f} slots and filling "
               f"{dem.bookings_per_slot.mean():.2f} of each. Telling that group to publish more is "
               "the one thing guaranteed not to work.")
    with st.expander("What this screen leaves out, on purpose"):
        st.markdown("""
- **Raw conversion leaderboard** — it ranks people by how fast their queue moved. Inside the
  30-minute bucket every specialist converts 50–59%.
- **Messages sent** — rewards volume, and phone calls are not in the data at all.
- **CSAT / NPS** — not in this dataset.
- **Cost to serve per doctor** — no time logs, no phone records. It belongs in an operating
  review with its assumptions stated, not on a Monday screen.""")

elif screen == "Control":
    st.title("Control")
    st.caption("Is this movement real, or is it noise? Frozen baseline, Western Electric rules 1, 2 and 4.")
    for key, ch in b["spc"].items():
        stb = ch["stability"]
        st.subheader(en(ch["label"]))
        if stb["stable"] is False:
            st.warning("⚠ " + en(stb["note"]))
        st.plotly_chart(V.control(ch, DARK), use_container_width=True, key=f"spc_{key}")
        fired = [p for p in ch["points"] if p["signals"]]
        c1, c2 = st.columns([1, 3])
        c1.metric("Signals", len(fired))
        c2.caption(f"Centre {ch['center']} · baseline {ch['baseline']['from']} to "
                   f"{ch['baseline']['to']} ({ch['baseline']['n_points']} points), frozen")
        if fired:
            with st.expander(f"{len(fired)} flagged points"):
                st.dataframe(pd.DataFrame([
                    {"Period": p["period"], "Value": p["value"], "n": p.get("n"),
                     "LCL": p["lcl"], "UCL": p["ucl"],
                     "Rules": ", ".join(p["signals"])} for p in fired]),
                    hide_index=True, width="stretch")
    with st.expander("What the rules mean"):
        st.markdown("""
**Rule 1** — one point beyond 3σ. Something changed, today.
**Rule 2** — two of three points beyond 2σ on the same side. A shift too small for rule 1 to catch quickly.
**Rule 3** — eight in a row on one side of the centre line. A sustained shift; on weekly data that takes eight weeks.

The baseline is frozen deliberately. Rolling limits absorb the shift you are trying to detect,
and after a bad quarter the chart declares the bad quarter normal.""")

elif screen == "Watchlist":
    P = b["predict"]
    st.title("Watchlist")
    st.caption("Sorted by how long you have left, not by how bad it is.")
    cl = P["ceiling"]
    st.error(f"**Ceiling: {cl['share']:.0%}.** {cl['note']}")
    lt = pd.DataFrame(P["lead_times"])
    st.subheader("How much warning each signal gives")
    st.dataframe(lt.rename(columns={"signal": "Signal", "n": "Churned doctors",
                                    "before_churn": "Arrived before churn",
                                    "median_days": "Median lead (days)",
                                    "p25": "p25", "p75": "p75"}),
                 hide_index=True, width="stretch")
    wl = pd.DataFrame(P["watchlist"])
    if who:
        wl = wl[wl.owner_specialist_id == who]
    elif role == "Manager":
        ids = set(SPEC[(SPEC.team_id == team)].specialist_id)
        wl = wl[wl.owner_specialist_id.isin(ids)]
    tabs = st.tabs([f"Act now ({(wl.tier=='act_now').sum()})",
                    f"Watch ({(wl.tier=='watch').sum()})",
                    f"Overdue ({(wl.tier=='overdue').sum()})"])
    for tab, tier in zip(tabs, ["act_now", "watch", "overdue"]):
        with tab:
            sub = wl[wl.tier == tier]
            if tier == "act_now":
                st.caption("Strongest signals, still inside the window they usually give you. "
                           "These are calls today.")
            elif tier == "watch":
                st.caption("Real signals with weaker lift (1.3–1.4×) and four times the volume. "
                           "Work these after the first tab is empty.")
            else:
                st.caption("Past the median lead for their signal. Probably already decided — "
                           "kept visible so nobody thinks the list is complete.")
            if sub.empty:
                st.success("Nothing in this tier.")
            for _, r in sub.head(25).iterrows():
                with st.container(border=True):
                    a, c2 = st.columns([4, 1])
                    with a:
                        st.markdown(f"**{r.doctor_name}** · {r.specialty} · {r.city} · "
                                    f"owner {r.owner_specialist_id}")
                        st.caption(f"*“{r.quote}”* — {r.signal_at}")
                        peer = f" vs {r.median_specialty_city:.0f} peer median" if pd.notna(r.median_specialty_city) else ""
                        st.caption(f"{(r.bookings_avg or 0):.0f} bookings/mo{peer} · risk {r.risk_score:.2f}")
                    with c2:
                        left = r.days_of_lead_left
                        st.metric("Days left", "—" if pd.isna(left) else f"{left:.0f}")
                        st.caption(f"said it {r.days_elapsed:.0f}d ago")
                    if st.button("Open", key=f"w{r.doctor_id}"):
                        goto(r.doctor_id); st.rerun()
    st.subheader("Day-14 onboarding checkpoint")
    d14 = P["day14"]
    ev = pd.DataFrame(d14["evidence"])
    st.dataframe(ev.rename(columns={"calendar_on_by_day_14": "Calendar on by day 14",
                                    "n": "Onboardings", "avg_score": "Avg score",
                                    "grade_a": "Grade A", "grade_d": "Grade D", "churn": "Churn"}),
                 hide_index=True, width="stretch")
    if not d14.get("live_cohort", True):
        st.info(d14["note"])
        r = d14["retrospective"]
        st.caption(f"Retrospectively: {r['failed_checkpoint']:,} onboardings failed the checkpoint "
                   f"and {r['grade_d_rate']:.1%} of them closed at grade D, against "
                   f"{r['passed_grade_d_rate']:.1%} of those that passed it.")
    else:
        st.dataframe(pd.DataFrame(d14["worklist"]), hide_index=True, width="stretch")
    fc = P["escalation_forecast"]
    if fc:
        st.subheader("Escalation volume, next four weeks")
        st.dataframe(pd.DataFrame(fc), hide_index=True, width="stretch")
        st.caption("A range, never a point. This is a staffing input, not a target.")

elif screen == "Cost":
    st.title("Cost")
    s = llm.summary(30)
    est = b["llm"]["estimate"]
    k = st.columns(4)
    k[0].metric("Spend, 30 days", f"${s['spend']:.2f}")
    k[1].metric("Budget used", f"{s['budget_used']:.0%}", help=f"Cap ${s['budget']:.2f}/month")
    k[2].metric("Calls", s["calls"])
    k[3].metric("Fell back", s["fallbacks"],
                help="Calls that returned the deterministic result instead — no key, switched off, "
                     "or the API failed. The product kept working.")
    if s["budget_used"] >= 0.8:
        st.warning("Over 80% of the monthly budget. At 100% runtime calls stop and the "
                   "deterministic path takes over — nothing breaks.")
    n_spec = int((SPEC.role == "Farming Specialist").sum())
    st.metric("Cost per specialist per month", f"${s['spend']/max(n_spec,1):.2f}",
              help=f"Actual spend over {n_spec} farming specialists, last 30 days.")
    st.subheader("What a full enrichment would cost")
    st.dataframe(pd.DataFrame([
        {"Job": "Theme discovery (Sonnet, batch)", "Unit": f"{est['unique_notes_all']:,} unique notes",
         "Tokens in": f"{est['tokens_all']:,}", "Cost": f"${est['themes_usd']}"},
        {"Job": "Doctor summaries (Haiku, batch)", "Unit": f"{est['summaries_doctors']:,} doctors",
         "Tokens in": f"{est['summaries_doctors']*127:,}", "Cost": f"${est['summaries_usd']}"},
        {"Job": "TOTAL, one-off bake", "Unit": "", "Tokens in": "",
         "Cost": f"${est['total_usd']}"}]), hide_index=True, width="stretch")
    st.caption("29,846 notes are 2,274 unique strings. Deduping before sending is a 10× saving, "
               "batching is another 2×, and only recomputing changed doctors is a 5× saving on "
               "the nightly job. Those three decisions are the whole cost answer.")
    if s["by_task"]:
        st.subheader("By task")
        st.dataframe(pd.DataFrame(s["by_task"]), hide_index=True, width="stretch")
    if s["by_specialist"]:
        st.subheader("By specialist")
        st.dataframe(pd.DataFrame(s["by_specialist"]), hide_index=True, width="stretch")
    st.info("**The model is not the cost. Specialist time is.** If this saves 14 specialists twenty "
            "minutes a day, the arithmetic is not close — and this ledger makes that a measurement "
            "rather than a claim.")

elif screen == "Doctor":
    pick = st.selectbox("Doctor", DOC.doctor_id.tolist(),
                        index=int(DOC.index[DOC.doctor_id == st.session_state.focus][0])
                        if (DOC.doctor_id == st.session_state.focus).any() else 0,
                        format_func=lambda d: f"{d} · {DOC.set_index('doctor_id').loc[d,'doctor_name']}")
    r = DOC[DOC.doctor_id == pick].iloc[0]
    st.title(r.doctor_name)
    a, c2, c3 = st.columns(3)
    a.write({"specialty": r.specialty, "city": r.city, "signed up": r.signup_date,
             "status": r.status, "owner": r.owner_specialist_id})
    c2.write({"onboarding": f"{r.onboarding_grade} ({r.onboarding_score})",
              "closed at the 28-day cap": bool(r.closed_at_cap),
              "missed the kickoff session": bool(r.sig_onboarding_no_show)})
    c3.write({"calendar": bool(r.calendar_enabled), "weekly slots": int(r.weekly_slots_published or 0),
              "bookings/slot": None if pd.isna(r.bookings_per_slot) else round(r.bookings_per_slot, 2),
              "vs peers": None if pd.isna(r.pct_specialty_city) else f"p{r.pct_specialty_city:.0%}"})
    h = BK[BK.doctor_id == pick].sort_values("month")
    if len(h):
        st.caption("Patient bookings by month — five monthly points, not a trend line")
        st.markdown(C.spark(h.patient_bookings.tolist(), width=300, height=60),
                    unsafe_allow_html=True)
        st.dataframe(h[["month", "patient_bookings", "admin_bookings"]], hide_index=True)
    st.divider()
    card(r, f"doc{pick}")
    st.caption("Last 10 contacts — the notes the ranking was built from")
    st.dataframe(INTER[INTER.doctor_id == pick].sort_values("occurred_at", ascending=False)
                 [["occurred_at", "channel", "direction", "specialist_id", "note"]].head(10),
                 hide_index=True, width="stretch")

elif screen == "Data & settings":
    st.title("Data & settings")

    st.subheader("Workbook")
    c1, c2 = st.columns([2, 1])
    c1.write({"file": M["source_file"], "sha256": M["source_sha256_16"],
              "built": M["built_at"], "build seconds": M["build_seconds"],
              "extract date": M["extract_date"]})
    c2.write({k: f"{v:,}" for k, v in M["row_counts"].items()})
    up = st.file_uploader("Load a different workbook (.xlsx)", type=["xlsx"])
    if up:
        tmp = ROOT / "out" / "_upload.xlsx"
        tmp.write_bytes(up.getbuffer())
        probs = B.validate(tmp)
        if probs:
            st.error("This workbook cannot be used — nothing was changed:")
            for p in probs:
                st.write("• " + p)
        else:
            st.success("Valid. All nine sheets and every required column present.")
            h = B.file_hash(tmp)
            known = (ROOT / "out" / "bundles" / f"{h}.json").exists()
            st.caption(f"sha {h} — " + ("already built, loads from cache instantly"
                                        if known else "new file, will build from scratch"))
            if st.button("Build bundle from this file"):
                with st.spinner("Building…"):
                    B.build(tmp)
                st.cache_data.clear(); st.rerun()
    if st.button("Rebuild from the current workbook"):
        with st.spinner("Rebuilding…"):
            B.build(cache=False)
        st.cache_data.clear(); st.rerun()

    st.subheader("Data quality")
    dq = pd.DataFrame(b["data_quality"])
    if len(dq):
        st.dataframe(dq, hide_index=True, width="stretch")
    st.caption("Checked on every build. Errors are things the brief says cannot happen.")

    st.subheader("AI features")
    s = llm.settings()
    on = st.toggle("Enable AI features", value=s.get("ai_enabled", False),
                   help="Off by default. Everything on every screen works with this off — "
                        "the drafts, the themes, the summaries are all in the bundle.")
    key_in = st.text_input("Anthropic API key", type="password",
                           placeholder="sk-ant-…  (stored in the macOS Keychain)")
    cA, cB = st.columns(2)
    if cA.button("Save key") and key_in:
        where = llm.set_api_key(key_in)
        st.success(f"Saved to {where}. It is never written to the bundle and never shown again.")
    k = llm.api_key()
    cB.caption(f"Key on file: …{k[-4:]}" if k else "No key on file")
    budget = st.number_input("Monthly budget, USD", 1.0, 500.0,
                             float(s.get("monthly_budget_usd", 25.0)), 1.0)
    if st.button("Save settings"):
        llm.save_settings({"ai_enabled": on, "monthly_budget_usd": budget})
        st.success("Saved."); st.rerun()
    if st.button("Test the connection"):
        t0 = time.time()
        r = llm.call("ask", "Reply with the single word: ok", "ping", fallback="(no call made)",
                     max_tokens=10)
        st.write({"source": r.source, "reply": r.text[:40],
                  "latency_s": round(time.time() - t0, 2), "cost_usd": r.cost})
    ok, why = llm.enabled()
    st.info(f"Status: **{'on' if ok else 'off'}** — {why}")
    est = b["llm"]["estimate"]
    st.caption(f"A full enrichment of this workbook would cost **${est['total_usd']}** "
               f"(${est['themes_usd']} themes + ${est['summaries_usd']} summaries), once.")

    st.subheader("Thresholds")
    st.caption("These are the rules every screen applies. Change one and rebuild — "
               "this is the live-change demo.")
    ed = st.data_editor(
        pd.DataFrame([{"rule": k, "value": v} for k, v in RULES.items()
                      if isinstance(v, (int, float))]),
        hide_index=True, width="stretch", key="rules_editor")
    st.caption("Editing here changes the bundle on the next rebuild. The authoritative copy "
               "lives in `src/pipeline.py → RULES`.")

    st.subheader("Working state")
    st.write(S.counts() or {"(nothing marked yet)": 0})
    if st.button("Clear all done / snoozed"):
        for d in list(S.hidden()):
            S.clear(d)
        st.rerun()

    st.subheader("Themes from the notes")
    ins = b["insights"]
    st.caption(f"LLM used: {ins['audit']['llm_used']} — {ins['audit'].get('reason','')}")
    th = pd.DataFrame(ins["rules_themes"])[["name", "notes", "doctors", "churn", "lift"]]
    st.dataframe(th, hide_index=True, width="stretch")
    st.caption("Ranked by measured churn lift, not by frequency. With AI on, the model adds "
               "themes for what the rules missed and proposes new regex rules for `notes.py` — "
               "and Python still computes every number in this table.")
