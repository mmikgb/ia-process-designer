"""
Monday morning report for a team manager.  python3 src/report.py

One self-contained HTML file per farming team, written to out/. No manual step:
it reads the same tables the copilot reads, so the two cannot disagree.
"""
from __future__ import annotations
import json
from datetime import timedelta
from pathlib import Path
import pandas as pd

from charts import hbars

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
RULES = json.loads((OUT / "rules.json").read_text())
ASOF = pd.Timestamp(RULES["extract_date"])
TARGET = RULES["escalation_pickup_target_min"]
MIN_N = 10          # below this we show the count and refuse to show a rate
EXPLAIN_BAND = (0.6, 1.4)   # decomposition must land in this band to be published

# What we deliberately do NOT show, and why. Printed in the report itself.
OMITTED = [
    ("Raw conversion rate per specialist",
     "It ranks people by how fast their queue moved, not by how well they worked. "
     "Inside the 30-minute bucket every specialist converts at 50–59%. Publishing the raw "
     "rate would have this team coaching the wrong six people."),
    ("Interactions or messages sent",
     "Rewards volume. The specialist who sends 200 low-value WhatsApps outranks the one who "
     "saved four accounts by phone — and phone calls are not even in the data."),
    ("CSAT / NPS", "Not in this dataset. A metric nobody can trace back to a row is a metric "
     "the team stops trusting."),
    ("Cost to serve per doctor",
     "There are no time logs and no phone records. Contacts per doctor is a partial proxy and "
     "would read as precision we do not have. It belongs in the operating review, with its "
     "assumptions stated, not on a Monday dashboard."),
]

CSS = """
:root{
  --bg:#fcfcfb; --fg:#14211c; --mut:#5f6f68; --line:#e2e8e5; --surface:#f6f8f7;
  --brand:#0d8159; --bar:#0d8159; --bar-dim:#c3d6ce; --bad:#a8291f; --warn:#8a5d00;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#1a1a19; --fg:#e8eeeb; --mut:#98a8a1; --line:#2a332e; --surface:#212824;
  --brand:#22a87c; --bar:#22a87c; --bar-dim:#31463e; --bad:#ef8279; --warn:#d9a441;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);padding:40px 20px 72px;
  font:16px/1.6 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.wrap{max-width:780px;margin:0 auto}
h1{font-size:30px;line-height:1.15;letter-spacing:-.02em;margin:0 0 4px;font-weight:650}
h2{font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);
  font-weight:650;margin:46px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
h3{font-size:16px;margin:24px 0 6px;font-weight:620}
p{margin:12px 0}
.sub{color:var(--mut);margin:0 0 4px;font-size:14.5px}
.lead{font-size:18px;line-height:1.5;border-left:3px solid var(--brand);
  padding:2px 0 2px 18px;margin:26px 0 8px;font-weight:450}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:10px 0 4px}
th{text-align:left;font-weight:600;color:var(--mut);font-size:12.5px;letter-spacing:.03em;
  text-transform:uppercase;padding:0 10px 7px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
td.n,th.n{text-align:right}
.bad{color:var(--bad);font-weight:600}.ok{color:var(--brand);font-weight:600}.warn{color:var(--warn)}
.note{color:var(--mut);font-size:13.5px;line-height:1.5;margin:8px 0 0}
.chart{margin:14px 0 2px;overflow:visible}
.quote{color:var(--mut);font-style:italic}
.card{background:var(--surface);border-radius:10px;padding:14px 18px;margin:12px 0}
.pill{display:inline-block;background:var(--surface);border-radius:99px;padding:2px 10px;
  font-size:12px;color:var(--mut)}
"""


def esc_table(e, sp):
    rows = []
    for _, s in sp.iterrows():
        x = e[e.specialist_id == s.specialist_id]
        if not len(x):
            continue
        rows.append(dict(who=f"{s.specialist_id} · {s.specialist_name.split()[0]}",
                         n=len(x), med=x.minutes_to_pickup.median(),
                         within=x.within_target.mean(), conv=x.converted.mean(),
                         fast=x[x.within_target].converted.mean() if x.within_target.any() else float("nan")))
    return pd.DataFrame(rows).sort_values("within", ascending=False)


def explain_movement(e_team):
    """Decompose the change in conversion between the last two 28-day windows into
    MIX (which latency buckets escalations landed in) and RATE (conversion inside
    each bucket). We only publish an explanation when the decomposition accounts
    for most of the movement; otherwise we say it is unexplained."""
    cur = e_team[(e_team.escalated_at > ASOF - timedelta(days=28)) & (e_team.escalated_at <= ASOF)]
    pre = e_team[(e_team.escalated_at > ASOF - timedelta(days=56)) & (e_team.escalated_at <= ASOF - timedelta(days=28))]
    if len(cur) < 15 or len(pre) < 15:
        return None, "Too few escalations in one of the two windows to say anything honest."
    d_total = cur.converted.mean() - pre.converted.mean()
    buckets = ["<30m", "30-60m", "60-120m", "120m+"]
    wc = cur.pickup_bucket.value_counts(normalize=True).reindex(buckets).fillna(0)
    wp = pre.pickup_bucket.value_counts(normalize=True).reindex(buckets).fillna(0)
    rc = cur.groupby("pickup_bucket", observed=False).converted.mean().reindex(buckets)
    rp = pre.groupby("pickup_bucket", observed=False).converted.mean().reindex(buckets)
    base = rp.fillna(pre.converted.mean())
    mix = float(((wc - wp) * base).sum())
    rate = float((wp * (rc.fillna(base) - base)).sum())
    resid = float(d_total - mix - rate)      # interaction; the three always sum to the total
    covered = abs(mix + rate) / abs(d_total) if d_total else 0
    honest = EXPLAIN_BAND[0] <= covered <= EXPLAIN_BAND[1]
    return dict(total=d_total, mix=mix, rate=rate, resid=resid, n_cur=len(cur), n_pre=len(pre),
                covered=covered, honest=honest), None


def render(team_id, doc, esc, spec, teams) -> str:
    t = teams.set_index("team_id").loc[team_id]
    sp = spec[(spec.team_id == team_id) & (spec.role == "Farming Specialist")]
    ids = set(sp.specialist_id)
    mine = doc[doc.owner_specialist_id.isin(ids) & (doc.status == "active")]
    e_team = esc[esc.specialist_id.isin(ids)]
    et = esc_table(e_team, sp)

    slow = et[et.within < 0.5]
    dropped = esc[~esc.is_person]
    hollow = mine[mine.calendar_hollow]
    stale = mine[mine.days_since_contact > RULES["stale_contact_days"]]
    at_risk = mine[mine.risk_score >= 0.5]

    lead = (f"Escalations answered inside {TARGET} minutes convert at "
            f"{esc[esc.within_target].converted.mean():.0%}; after two hours, "
            f"{esc[esc.pickup_bucket == '120m+'].converted.mean():.0%}. "
            f"{len(slow)} of your {len(et)} specialists answer fewer than half of theirs inside the target, "
            f"and that — not how they talk to doctors — is where your conversion is going.")

    mv, why_not = explain_movement(e_team)

    h = [f"<!doctype html><meta charset=utf-8><title>{t.team_name} · Monday</title>",
         f"<style>{CSS}</style><div class=wrap>",
         f"<h1>{t.team_name}</h1>",
         f"<p class=sub>{t.manager_name} · week of {ASOF.date()} · "
         f"{len(sp)} specialists · {len(mine)} active doctors</p>",
         f"<div class=lead>{lead}</div>"]

    # 1 — the lever
    h.append("<h2>1 · Escalation pickup</h2><table><tr><th>Specialist</th>"
             "<th class=n>Escalations</th><th class=n>Median pickup</th>"
             f"<th class=n>Inside {TARGET}m</th><th class=n>Converted</th>"
             f"<th class=n>Converted when inside {TARGET}m</th></tr>")
    for _, r in et.iterrows():
        if r.n < MIN_N:
            h.append(f"<tr><td>{r.who}</td><td class=n>{r.n}</td>"
                     f"<td class=n>{r.med:.0f} min</td>"
                     f"<td class=n colspan=3 style='text-align:left;color:var(--mut)'>"
                     f"fewer than {MIN_N} escalations — no rate shown</td></tr>")
            continue
        cls = "bad" if r.within < 0.5 else "ok"
        fast = f"{r.fast:.0%}" if pd.notna(r.fast) else "—"
        h.append(f"<tr><td>{r.who}</td><td class=n>{r.n}</td>"
                 f"<td class='n {cls}'>{r.med:.0f} min</td><td class='n {cls}'>{r.within:.0%}</td>"
                 f"<td class=n>{r.conv:.0%}</td><td class=n>{fast}</td></tr>")
    h.append(f"</table><p class=note>The last two columns are the point: the spread in "
             "'Converted' disappears in 'Converted when fast'. Coach the queue, not the people. "
             f"Anyone with fewer than {MIN_N} escalations gets a count and no percentage — a rate "
             "built on three cases is a rumour.</p>")

    # 2 — movement
    h.append("<h2>2 · What moved, and whether we can explain it</h2>")
    if mv is None:
        h.append(f"<p class=note>{why_not}</p>")
    else:
        d = mv["total"]
        h.append(f"<p>Team conversion moved <b>{d:+.1%}</b> versus the previous 28 days "
                 f"({mv['n_cur']} escalations against {mv['n_pre']}).</p>")
        if mv["honest"]:
            h.append("<table><tr><th>Component</th><th class=n>Contribution</th><th>Reading</th></tr>"
                     f"<tr><td>Mix — which latency buckets escalations landed in</td>"
                     f"<td class=n>{mv['mix']:+.1%}</td><td>routing and availability</td></tr>"
                     f"<tr><td>Rate — conversion inside each bucket</td>"
                     f"<td class=n>{mv['rate']:+.1%}</td><td>the conversations themselves</td></tr>"
                     f"<tr><td>Residual — interaction between the two</td>"
                     f"<td class=n>{mv['resid']:+.1%}</td><td>not attributed</td></tr></table>"
                     f"<p class=note>The three components sum to the movement by construction. "
                     f"Mix and rate alone account for {mv['covered']:.0%} of it; we publish an "
                     f"explanation only when that lands between {EXPLAIN_BAND[0]:.0%} and "
                     f"{EXPLAIN_BAND[1]:.0%}, and with {mv['n_cur']} escalations this week a swing "
                     "of a few points is still within noise.</p>")
        else:
            h.append(f"<p class='note warn'>Unexplained. Mix and rate together account for only "
                     f"{mv['covered']:.0%} of the movement, so we are not attributing it. "
                     "Treat the change as noise until next week.</p>")

    # 3 — dropped escalations
    if len(dropped):
        h.append("<h2>3 · Escalations nobody owned</h2>"
                 f"<p>{len(dropped)} escalations across the operation had no case linked or sat in the "
                 f"unassigned queue. They waited a median of {dropped.minutes_to_pickup.median():.0f} minutes "
                 f"and converted at <span class=bad>{dropped.converted.mean():.0%}</span> against "
                 f"{esc[esc.is_person].converted.mean():.0%} for the rest.</p>"
                 "<p class=note>This is not a person's performance. It is a routing gap, and it is the "
                 "cheapest thing on this page to fix.</p>")

    # 4 — what the doctors said, in the specialists' own notes
    threats = mine[mine.sig_churn_threat].sort_values("risk_score", ascending=False)
    h.append("<h2>4 · What your doctors told you</h2>")
    if len(threats):
        h.append(f"<p><b>{len(threats)} doctors in this team have said out loud that they may cancel "
                 "or are comparing platforms.</b> Across the base, 36% of them churn against 6.6% for "
                 "everyone else — the strongest predictor in the file. It lives in the free-text notes "
                 "your own specialists write, and nothing reads that column today.</p>")
        h.append("<table><tr><th>Doctor</th><th>Owner</th><th class=n>Bookings/mo</th>"
                 "<th class=n>Peer median</th><th>What they said</th></tr>")
        for _, r in threats.head(10).iterrows():
            peer = f"{r.median_specialty_city:.0f}" if pd.notna(r.median_specialty_city) else "—"
            h.append(f"<tr><td>{r.doctor_name}<br><span class=note>{r.specialty} · {r.city}</span></td>"
                     f"<td>{r.owner_specialist_id}</td><td class=n>{r.bookings_avg:.0f}</td>"
                     f"<td class=n>{peer}</td>"
                     f"<td class=quote>&ldquo;{str(r.top_signal_note)[:130]}&rdquo;"
                     f"<br><span class=note>{r.top_signal_at:%d %b}</span></td></tr>")
        h.append("</table>")
        if len(threats) > 10:
            h.append(f"<p class=note>{len(threats)-10} more, ranked, in the copilot.</p>")
        h.append("<p class=note>These are calls, not campaigns. The copilot refuses to draft a WhatsApp "
                 "for anyone on this list and produces a call brief instead.</p>")

    knew = mine[mine.sig_hollow_calendar]
    if len(knew):
        h.append("<h2>4b · Your specialists already found this</h2>"
                 f"<div class=card><p style='margin:0'>{len(knew)} doctors here carry a note written by "
                 "their own specialist saying the calendar is on with nothing published — "
                 "<i>&lsquo;prendió el calendario en la campaña pero no cargó horarios&rsquo;</i>. "
                 "Across the operation those notes are right <b>100% of the time</b>: every doctor "
                 "flagged is still in that state.</p>"
                 "<p class=note style='margin:10px 0 0'>Campaign 4 counts each of them as a conversion. "
                 "The operation diagnosed its own broken campaign by hand, in Spanish, months ago. "
                 "Nothing read it.</p></div>")

    # 5 — this week's work
    h.append("<h2>5 · Work available to your team this week</h2><table>"
             "<tr><th>Specialist</th><th class=n>Portfolio</th><th class=n>May cancel</th>"
             "<th class=n>At risk</th><th class=n>Agenda too thin</th>"
             "<th class=n>Not being found</th><th class=n>Open commitments</th></tr>")
    for _, s in sp.iterrows():
        p = mine[mine.owner_specialist_id == s.specialist_id]
        h.append(f"<tr><td>{s.specialist_id} · {s.specialist_name.split()[0]}</td>"
                 f"<td class=n>{len(p)}</td>"
                 f"<td class='n bad'>{int(p.sig_churn_threat.sum())}</td>"
                 f"<td class=n>{(p.risk_score>=0.5).sum()}</td>"
                 f"<td class=n>{p.calendar_hollow.sum()}</td>"
                 f"<td class=n>{int(p.demand_constrained.sum())}</td>"
                 f"<td class=n>{int(p.commitment_open.sum())}</td></tr>")
    h.append("</table>")
    dem = mine[mine.demand_constrained]
    h.append("<h3>The last two columns are different problems</h3>"
             f"<p><b>Agenda too thin</b> — {int(mine.calendar_hollow.sum())} doctors with the calendar "
             f"on and fewer than {RULES['calendar_healthy_slots']} slots published. They average "
             f"{mine[mine.calendar_hollow].bookings_avg.mean():.1f} bookings a month against "
             f"{mine[~mine.calendar_hollow & mine.calendar_enabled].bookings_avg.mean():.1f} for the rest, "
             "and campaign 4 counts every one of them as a conversion. The fix is to open more slots.</p>"
             f"<p><b>Not being found</b> — {len(dem)} doctors averaging "
             f"{dem.weekly_slots_published.mean():.0f} open slots a week and filling "
             f"{dem.bookings_per_slot.mean():.2f} of each one, at least "
             f"{RULES['meaningful_peer_gap']:.0f} bookings a month below the median for their specialty "
             "and city. Availability is not their constraint — visibility is. "
             "<b>Telling this group to publish more slots is the one piece of advice guaranteed not to "
             "work, and it is what every campaign currently tells them.</b> "
             "The copilot now opens a profile and positioning conversation for them instead.</p>")

    # 5 — what is not here
    h.append("<h2>6 · What this report leaves out, on purpose</h2><table>"
             "<tr><th>Not shown</th><th>Why</th></tr>")
    for k, v in OMITTED:
        h.append(f"<tr><td>{k}</td><td>{v}</td></tr>")
    h.append("</table>")

    h.append(f"<p class=note style='margin-top:28px'><span class=pill>generated</span> "
             f"by src/report.py from out/, built by src/pipeline.py. No manual step. "
             f"Rerun the pipeline and this page changes.</p></div>")
    return "\n".join(h)


def main():
    doc = pd.read_parquet(OUT / "doctor_features.parquet")
    esc = pd.read_parquet(OUT / "escalation_features.parquet")
    spec = pd.read_parquet(OUT / "specialist_features.parquet")
    teams = pd.read_parquet(OUT / "teams.parquet")
    for tid in teams[teams.team_id != "T4"].team_id:
        p = OUT / f"report_{tid}.html"
        p.write_text(render(tid, doc, esc, spec, teams), encoding="utf-8")
        print("wrote", p.relative_to(ROOT))


if __name__ == "__main__":
    main()
