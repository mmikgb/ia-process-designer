"""
Every claim in FINDINGS.md, recomputed.  python3 src/analysis.py

Run this before quoting any number from the findings document. If a number here
disagrees with the document, the document is wrong.
"""
import sys
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).parent))
from pipeline import load, DATA

t = load(DATA)
d, o, enr, esc, bk, sp = (t["doctors"], t["onboardings"], t["campaign_enrollments"],
                          t["escalations"], t["bookings_monthly"], t["specialists"])
o = o.merge(d[["doctor_id", "calendar_enabled", "weekly_slots_published", "signup_date", "status"]], on="doctor_id")
o["m"] = o.started_at.dt.to_period("M")
line = lambda s: print(f"\n{'='*72}\n{s}\n{'='*72}")

line("1 · ONBOARDING GRADE vs CALENDAR")
print(o.groupby("calendar_enabled").agg(n=("score","size"), score=("score","mean"),
      pct_A=("grade", lambda s:(s=="A").mean())).round(3))
print()
g = o.groupby("m").agg(cal=("calendar_enabled","mean"), score=("score","mean"))
gr = o.pivot_table(index="m", columns="grade", values="onboarding_id", aggfunc="size").div(o.groupby("m").size(), axis=0)
print(pd.concat([g, gr[["A","D"]]], axis=1).round(3))
print("\nclose-day distribution:", dict(o.days_to_close.value_counts().sort_index()))
print("closing exactly at 28:", (o.days_to_close==28).sum(), f"({(o.days_to_close==28).mean():.1%})")
print("score by close bucket:")
print(o.assign(b=np.where(o.days_to_close>28,">28",np.where(o.days_to_close==28,"=28","<28")))
       .groupby("b").score.agg(["size","mean"]).round(2))
print("\nspecialist spread by month (max-min):")
pm = o.pivot_table(index="m", columns="specialist_id", values="score", aggfunc="mean")
print((pm.max(axis=1)-pm.min(axis=1)).round(2).to_dict())
print("\nchurn by grade:")
print(o.groupby("grade").status.agg(n="size", churn=lambda s:(s=="churned").mean()).round(3))
print("churn by calendar:")
print(d.groupby("calendar_enabled").status.agg(n="size", churn=lambda s:(s=="churned").mean()).round(3))

line("2 · CAMPAIGN BEFORE/AFTER")
bk["mp"] = pd.PeriodIndex(bk.month, freq="M")
months = sorted(bk.mp.unique()); mi = {m:i for i,m in enumerate(months)}
E = enr[["enrollment_id","doctor_id","campaign_id"]].copy()
E["mp"] = enr.enrolled_at.dt.to_period("M")
for col in ["patient_bookings","admin_bookings"]:
    P = bk.pivot_table(index="doctor_id", columns="mp", values=col).reindex(columns=months)
    arr, idx = P.values, {x:i for i,x in enumerate(P.index)}
    pre, post = [], []
    for _, r in E.iterrows():
        if r.doctor_id not in idx or r.mp not in mi: pre.append(np.nan); post.append(np.nan); continue
        i, j = idx[r.doctor_id], mi[r.mp]
        a, b = arr[i,:j], arr[i,j+1:]; a, b = a[~np.isnan(a)], b[~np.isnan(b)]
        pre.append(a.mean() if len(a) else np.nan); post.append(b.mean() if len(b) else np.nan)
    E[col+"_pre"], E[col+"_post"] = pre, post
    E[col+"_delta"] = E[col+"_post"] - E[col+"_pre"]
print(E.groupby("campaign_id").agg(n=("enrollment_id","size"), measurable=("patient_bookings_delta","count"),
      pre=("patient_bookings_pre","mean"), pat=("patient_bookings_delta","mean"),
      adm=("admin_bookings_delta","mean")).round(3))
print("\nmarket trend (mean patient bookings/doctor/month):")
print(bk.groupby("mp").patient_bookings.mean().round(2).to_dict())

line("2b · CAMPAIGN 4 SPLIT BY WHETHER THEY CONVERTED")
E4 = E[E.campaign_id=="C4"].merge(d[["doctor_id","calendar_enabled","weekly_slots_published"]], on="doctor_id")
E4 = E4.dropna(subset=["patient_bookings_delta"])
print(E4.groupby("calendar_enabled").agg(n=("doctor_id","size"), pre=("patient_bookings_pre","mean"),
      delta=("patient_bookings_delta","mean")).round(2))
print("\nslots published among C4 converters:", E4[E4.calendar_enabled].weekly_slots_published.describe()[["count","max"]].to_dict())
print("of which zero slots:", int((E4[E4.calendar_enabled].weekly_slots_published==0).sum()))
print("\nbookings by slots published (calendar ON, whole base):")
on = d[d.calendar_enabled].join(bk.groupby("doctor_id").patient_bookings.mean().rename("pat"), on="doctor_id")
print(on.groupby(pd.cut(on.weekly_slots_published,[-1,0,8,14,20,999])).pat.agg(["size","mean"]).round(2))
print("calendar OFF reference:", round(d[~d.calendar_enabled].join(
      bk.groupby("doctor_id").patient_bookings.mean().rename("pat"), on="doctor_id").pat.mean(),2))
print("\nHOLLOW doctors in the base (calendar on, <8 slots):",
      int((d.calendar_enabled & (d.weekly_slots_published<8)).sum()))

line("4 · ESCALATIONS")
e = esc[esc.specialist_id.isin(["S01","S02","S03","S04","S05","S06"])].copy()
e["b"] = pd.cut(e.minutes_to_pickup,[-1,30,60,120,10**6],labels=["<30","30-60","60-120","120+"])
tab = e.groupby("specialist_id").agg(n=("escalation_id","size"), med=("minutes_to_pickup","median"),
      within=("minutes_to_pickup", lambda s:(s<=30).mean()), conv=("converted","mean"))
tab["conv_fast"] = e[e.minutes_to_pickup<=30].groupby("specialist_id").converted.mean()
print(tab.round(3))
# Spearman by hand — six points, and one less dependency to install on a strange machine.
rho = tab.conv.rank().corr(tab.med.rank())
print(f"\nspearman(conversion, median pickup): {rho:.3f}")
print("\npooled by bucket:"); print(e.groupby("b", observed=True).converted.agg(["size","mean"]).round(3))
print("\nwithin-bucket by specialist:")
print(e.pivot_table(index="specialist_id", columns="b", values="converted", aggfunc="mean", observed=True).round(3))
print("\nunowned escalations:")
u = esc[~esc.specialist_id.isin(sp.specialist_id)]
print(f"  n={len(u)} ({len(u)/len(esc):.1%})  median pickup={u.minutes_to_pickup.median():.0f}min  "
      f"converted={u.converted.mean():.1%}  vs rest={esc[esc.specialist_id.isin(sp.specialist_id)].converted.mean():.1%}")
print(f"\nescalations/month: {len(esc)/6:.0f}  overall conversion: {esc.converted.mean():.1%}")

line("7 · WHAT THE NOTES SAY — and whether the weights are earned")
import notes as NT
doc = pd.read_parquet(Path(__file__).resolve().parent.parent / "out" / "doctor_features.parquet")
doc["ever_replied"] = doc.ever_replied.fillna(False).astype(bool)
tg = NT.tag_interactions(t["interactions"])
tot = tg.interaction_id.nunique(); un = tg[tg.tag == "untagged"].interaction_id.nunique()
print(f"notes: {tot}   tagged: {tot-un} ({1-un/tot:.1%})")
print("\ntag frequency:")
print(tg[tg.tag != "untagged"].groupby("tag").interaction_id.nunique().sort_values(ascending=False).to_string())

base = (doc.status == "churned").mean()
print(f"\nbaseline churn: {base:.4f}")
rows = []
def lift(label, mask):
    m = doc[pd.Series(mask).fillna(False).astype(bool)]
    if len(m) < 50: return
    c = (m.status == "churned").mean()
    rows.append((label, len(m), round(c, 3), round(c / base, 2)))
lift("note: said they would cancel", doc.sig_churn_threat)
lift("grade D", doc.onboarding_grade == "D")
lift("note: discouraged", doc.sig_discouraged)
lift("bottom quartile vs specialty+city", doc.bottom_quartile)
lift("calendar off", ~doc.calendar_enabled)
lift("note: >=1 complaint", doc.complaints >= 1)
lift("grade C", doc.onboarding_grade == "C")
lift("calendar on, <8 slots", doc.calendar_hollow)
lift("ignored streak >=3", doc.ignored_streak >= 3)
lift("--- below here: no signal, zero weight ---", doc.doctor_id.isna())
lift("note: >=2 complaints", doc.complaints >= 2)
lift("never replied to anything", ~doc.ever_replied)
lift("bookings trend negative", doc.bookings_slope < 0)
lift("2+ months since booking peak", doc.months_since_peak >= 2)
lift("gatekeeper (assistant runs agenda)", doc.sig_gatekeeper)
lift("3+ campaigns in 60 days", doc.over_contacted)
print(pd.DataFrame(rows, columns=["signal", "n", "churn", "lift"]).to_string(index=False))

print("\ndoes the risk score rank churn?")
b = doc.assign(bucket=pd.cut(doc.risk_score, [-.01, .15, .3, .5, .7, 1.01]))
print(b.groupby("bucket", observed=True).status.agg(n="size", churn=lambda s: (s == "churned").mean()).round(3).to_string())

print("\nspecialists' hollow-calendar notes — precision against the actual state:")
hh = doc[doc.sig_hollow_calendar]
print(f"  flagged by a specialist: {len(hh)}   still calendar-on-with-<8-slots: "
      f"{int((hh.calendar_enabled & (hh.weekly_slots_published < 8)).sum())}   "
      f"precision: {(hh.calendar_enabled & (hh.weekly_slots_published < 8)).mean():.3f}")

line("9 · SUPPLY vs DEMAND — two ways to under-perform")
a = doc[doc.calendar_enabled & (doc.weekly_slots_published > 0)].copy()
a["sb"] = pd.cut(a.weekly_slots_published, [-1, 0, 2, 4, 6, 8, 10, 14, 20, 30, 999])
t = a.groupby("sb", observed=True).agg(n=("doctor_id", "size"), bookings=("bookings_avg", "mean"),
                                       per_slot=("bookings_per_slot", "mean"))
t["marginal"] = t.bookings.diff()
print("returns against published slots — the cliff, and where it flattens:")
print(t.round(2).to_string())
print("\nthe two segments (active doctors):")
act = doc[doc.status == "active"]
for c, label in [("supply_constrained", "agenda too thin — every slot fills"),
                 ("demand_constrained", "plenty of slots, nobody finds them")]:
    m = act[act[c]]
    print(f"  {label:38} n={len(m):5}  slots={m.weekly_slots_published.mean():5.1f}  "
          f"bookings={m.bookings_avg.mean():5.1f}  per_slot={m.bookings_per_slot.mean():5.2f}  "
          f"gap={m.peer_gap.mean():+5.1f}")
print("\nsignals that did NOT survive (reported in FINDINGS section 9):")
print(f"  onboarding no-show → grade A rate "
      f"{doc[doc.sig_onboarding_no_show].onboarding_grade.eq('A').mean():.3f} vs "
      f"{doc[~doc.sig_onboarding_no_show].onboarding_grade.eq('A').mean():.3f} — no effect")
cells = doc.groupby(["specialty", "city"]).bookings_avg.agg(["size", "median"]).query("size>=30")
print(f"  peer medians across {len(cells)} specialty×city cells: "
      f"{cells['median'].min():.1f} to {cells['median'].max():.1f} (sd {cells['median'].std():.2f}) — narrow")
