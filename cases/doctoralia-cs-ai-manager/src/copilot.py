"""
Farming specialist copilot.  streamlit run src/copilot.py

Reads only out/ (built by pipeline.py). Never touches the workbook.
"""
from __future__ import annotations
import sys
from pathlib import Path
import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))
import draft as D

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"

st.set_page_config(page_title="CS Copilot · Doctoralia", layout="wide")
st.markdown("""<style>
[data-testid="stMetricValue"]{font-size:1.5rem}
.stTextArea textarea{font-size:.92rem;line-height:1.45}
</style>""", unsafe_allow_html=True)


@st.cache_data
def load():
    return (pd.read_parquet(OUT / "doctor_features.parquet"),
            pd.read_parquet(OUT / "escalation_features.parquet"),
            pd.read_parquet(OUT / "specialist_features.parquet"),
            pd.read_parquet(OUT / "interactions.parquet"),
            pd.read_parquet(OUT / "bookings.parquet"))


doc, esc, spec, inter, bk = load()

farmers = spec[spec.role == "Farming Specialist"].sort_values("specialist_id")
labels = {r.specialist_id: f"{r.specialist_id} · {r.specialist_name}" for _, r in farmers.iterrows()}
who = st.sidebar.selectbox("Specialist", list(labels), format_func=lambda k: labels[k])
me = spec.set_index("specialist_id").loc[who]
first = me.specialist_name.split()[0]
show_n = st.sidebar.slider("Accounts in the queue", 5, 40, 12)
st.sidebar.divider()
st.sidebar.caption("Thresholds: `pipeline.py → RULES`\n\nPlays and their order: `draft.py → PLAYS`\n\n"
                   "Note signals: `notes.py → RULES`")

mine = doc[(doc.owner_specialist_id == who) & (doc.status == "active")].copy()

st.title("Tuesday morning")
st.caption(f"{me.specialist_name} · {len(mine)} active doctors · data as of 25 Sep 2026")

c = st.columns(5)
c[0].metric("Said they may cancel", int(mine.sig_churn_threat.sum()))
c[1].metric("At risk (≥0.5)", int((mine.risk_score >= 0.5).sum()))
c[2].metric("Not being found", int(mine.demand_constrained.sum()),
            help="Plenty of open slots, well below their specialty's median. Visibility problem, "
                 "not an agenda problem.")
c[3].metric("Open commitments", int(mine.commitment_open.sum()))
c[4].metric("Median escalation pickup",
            f"{me.median_pickup_min:.0f}m" if pd.notna(me.median_pickup_min) else "—",
            delta=f"{me.median_pickup_min - 30:+.0f} vs target" if pd.notna(me.median_pickup_min) else None,
            delta_color="inverse")

if pd.notna(me.median_pickup_min) and me.median_pickup_min > 30:
    st.warning(f"Your escalations wait a median of {me.median_pickup_min:.0f} minutes. Team-wide, "
               f"those answered inside 30 minutes convert at 54%; after two hours, 14%. Your own "
               f"conversion inside 30 minutes is {me.conversion_when_fast:.0%} — the same as "
               "everyone else's. The queue is the problem, not the conversation.")

tab_q, tab_d, tab_why = st.tabs(["Queue", "Doctor", "How this decides"])

ICON = {"draft": "✎", "brief": "☎", "handoff": "→"}
mine["work_next"] = mine.risk_score.where(mine.risk_score >= 0.15, 0)
q = mine.sort_values(["work_next", "bookings_avg"], ascending=[False, False]).head(show_n)


def card(r, key):
    res = D.compose(r, first)
    with st.container(border=True):
        a, b = st.columns([3, 1])
        with a:
            st.markdown(f"**{r.doctor_name}** · {r.specialty} · {r.city}")
            st.caption(f"{r.doctor_id} · grade {r.onboarding_grade or '—'} · "
                       f"{r.bookings_avg:.0f} bookings/mo vs {r.median_specialty_city:.0f} "
                       f"median for their specialty here"
                       if pd.notna(r.median_specialty_city) else r.doctor_id)
            st.markdown(f"**Why now:** {r.risk_reasons or 'no active signal'}")
        with b:
            st.metric("Risk", f"{r.risk_score:.2f}")
            st.caption(f"{ICON.get(res['mode'], '')} {res['mode'] or 'no play'}")
        if res["channel"]:
            st.caption(f"⚑ {res['channel']}")
        if pd.notna(r.top_signal_note) and r.top_signal not in (None, "positive"):
            st.caption(f"Last signal, {r.top_signal_at:%d %b}: *“{str(r.top_signal_note)[:170]}”*")
        if res["confident"]:
            st.markdown(f"_{res['why']}_")
            st.text_area("Draft — send as is or edit", res["draft"], key=key, height=125)
        elif res["mode"] == "brief":
            st.error("**Not a message.** " + res["why"])
            st.code(res["instead"], language=None)
        elif res["mode"] == "handoff":
            st.info(res["instead"])
        else:
            st.warning(res["instead"])


with tab_q:
    if q.empty:
        st.success("Nothing flagged in your portfolio. Spend the day on proactive calls.")
    for _, r in q.iterrows():
        card(r, f"q{r.doctor_id}")

with tab_d:
    pick = st.selectbox("Doctor", q.doctor_id.tolist() + mine.doctor_id.tolist()[:300])
    r = doc[doc.doctor_id == pick].iloc[0]
    st.subheader(r.doctor_name)
    a, b, c3 = st.columns(3)
    a.write({"specialty": r.specialty, "city": r.city, "signed up": str(r.signup_date.date()),
             "status": r.status})
    b.write({"onboarding": f"{r.onboarding_grade} ({r.onboarding_score})",
             "closed at the 28-day cap": bool(r.closed_at_cap),
             "missed the kickoff session": bool(r.sig_onboarding_no_show)})
    c3.write({"calendar": bool(r.calendar_enabled), "weekly slots": int(r.weekly_slots_published),
              "vs peers": f"p{r.pct_specialty_city:.0%}" if pd.notna(r.pct_specialty_city) else "—",
              "last contact": str(r.last_contact.date()) if pd.notna(r.last_contact) else None})

    h = bk[bk.doctor_id == pick].sort_values("month")
    if len(h):
        st.caption("Patient bookings by month")
        st.bar_chart(h.set_index("month")[["patient_bookings", "admin_bookings"]], height=200)

    st.divider()
    card(r, f"d{pick}")

    st.caption("Last 10 contacts")
    st.dataframe(inter[inter.doctor_id == pick].sort_values("occurred_at", ascending=False)
                 [["occurred_at", "channel", "direction", "specialist_id", "note"]].head(10),
                 width="stretch", hide_index=True)

with tab_why:
    st.markdown("""
**The copilot ranks, it does not decide.** Risk is additive and every point traces to one rule in
`pipeline.py → risk()`. There is no model score to argue with — disagree with a ranking and you can
be shown the line that produced it.

**The weights are measured, not chosen.** Each one comes from the churn lift that signal actually
shows in this data. Three signals I expected to matter — unanswered outbound messages, campaign
over-contact, a falling booking trend — came back at or below baseline and carry no weight at all.

**Where the model is allowed to be wrong.** It never supplies a fact. Drafts are composed from the
doctor's own record by template; the model only rewrites for tone, and any number it introduces that
was not in the facts causes the polished version to be discarded.

**Three things it can produce, on purpose.** A *draft* you can send. A *brief* — for a doctor who has
said they may cancel, where a templated WhatsApp would do real damage, so it refuses to write one and
prepares you for a call instead. A *handoff* — not farming's work, routed with the doctor's own words
attached. Refusing to write a message is a designed output, not a gap.

**What it does when it is not confident.** Confidence is evidence completeness, not model certainty.
Below 0.55 it names what is missing and tells you what to confirm.
""")
    x, y = st.columns(2)
    with x:
        st.caption("Churn lift behind each weight")
        import pipeline as P
        st.dataframe(pd.DataFrame([{"signal": k, "n": v[0], "churn": f"{v[1]:.1%}", "lift": f"{v[2]}×"}
                                   for k, v in P.LIFT.items()]), hide_index=True,
                     width="stretch")
    with y:
        st.caption("Does the score rank churn?")
        v = doc.assign(b=pd.cut(doc.risk_score, [-.01, .15, .3, .5, .7, 1.01]))
        st.dataframe(v.groupby("b", observed=True).status.agg(
            doctors="size", churn=lambda s: f"{(s == 'churned').mean():.1%}").reset_index().astype(str),
            hide_index=True, width="stretch")
    st.caption("Data quality findings from the last build")
    st.dataframe(pd.read_json(OUT / "data_quality.json"), width="stretch", hide_index=True)
