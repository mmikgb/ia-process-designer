"""dayplan.py: the specialist's day. Runs on the real build (python3 src/pipeline.py first)."""
from pathlib import Path

import pandas as pd
import pytest

import dayplan
import draft as D
import forecast
import kpi
import notes as N
from pipeline import RULES

OUT = Path(__file__).resolve().parent.parent / "out"
ASOF = pd.Timestamp(RULES["extract_date"])


@pytest.fixture(scope="module")
def data():
    if not (OUT / "doctor_features.parquet").exists():
        pytest.skip("run python3 src/pipeline.py first")
    doc = pd.read_parquet(OUT / "doctor_features.parquet")
    tagged = N.tag_interactions(pd.read_parquet(OUT / "interactions.parquet"))
    leads = forecast.lead_times(tagged, doc)
    wl = forecast.watchlist(doc, leads, ASOF)
    copilot = {r.doctor_id: D.compose(r) for _, r in doc[doc.status == "active"].iterrows()}
    return doc, wl, copilot


@pytest.fixture(scope="module")
def queues(data):
    doc, wl, copilot = data
    return dayplan.build(doc, wl, RULES, ASOF, copilot)


def by_block(q, block):
    return [x for x in q["items"] if x["block"] == block]


def test_every_doctor_in_exactly_one_block(queues):
    seen = [x["doctor_id"] for q in queues.values() for x in q["items"]]
    assert len(seen) == len(set(seen))
    for q in queues.values():
        assert [x["rank"] for x in q["items"]] == list(range(1, len(q["items"]) + 1))
        blocks = [x["block"] for x in q["items"]]
        assert blocks == sorted(blocks, key=dayplan.BLOCKS.index)


def test_call_is_the_owners_act_now_in_brief_mode(data, queues):
    doc, wl, copilot = data
    for owner, q in queues.items():
        want = {w["doctor_id"] for w in wl if w["owner_specialist_id"] == owner
                and w["tier"] == "act_now" and copilot[w["doctor_id"]]["mode"] == "brief"}
        assert {x["doctor_id"] for x in by_block(q, "call")} == want, owner


def test_calls_ordered_by_lead_left_then_risk(queues):
    for q in queues.values():
        k = [(x["days_of_lead_left"], -x["risk_score"]) for x in by_block(q, "call")]
        assert k == sorted(k)


def test_followups_within_quota_and_window(queues):
    for q in queues.values():
        fu = by_block(q, "followup")
        assert len(fu) <= RULES["daily_followup_quota"]
        for x in fu:
            late = (ASOF - pd.Timestamp(x["due_at"])).days
            assert 0 <= late <= RULES["followup_stale_days"]


def test_capacity(queues):
    cap = RULES["daily_capacity"]
    for q in queues.values():
        n_call = len(by_block(q, "call"))
        planned = n_call + len(by_block(q, "followup")) + len(by_block(q, "message"))
        assert planned <= max(cap, n_call)
        over = [x for x in by_block(q, "later") if x.get("origin")]
        assert all(x["later_reason"]["en"] == "beyond today's capacity" for x in over)
        assert all(x["origin"] in ("followup", "message") for x in over)


def test_handoffs_do_not_count_against_capacity(data):
    doc, wl, copilot = data
    q = dayplan.build(doc, wl, RULES, ASOF, copilot)
    for owner, v in q.items():
        assert len(by_block(v, "handoff")) == v["counts"]["handoff"]


def test_every_item_has_a_bilingual_reason(queues):
    for q in queues.values():
        for x in q["items"]:
            assert x["reason"]["en"] and x["reason"]["es"]
            if x["block"] == "later":
                assert x["later_reason"]["en"] and x["later_reason"]["es"]


def test_moving_a_play_reorders_messages(data, monkeypatch):
    doc, wl, _ = data
    big = dict(RULES, daily_capacity=10**6, daily_followup_quota=10**6)

    def first(qs, play):
        # position of the first message with that play, per owner that has both
        return {o: [x["play"] for x in by_block(q, "message")].index(play)
                for o, q in qs.items()
                if {"visibility", "hollow_calendar"} <= {x["play"] for x in by_block(q, "message")}}

    before = dayplan.build(doc, wl, big, ASOF)
    b_vis, b_hol = first(before, "visibility"), first(before, "hollow_calendar")
    assert b_vis and all(b_hol[o] < b_vis[o] for o in b_vis)

    plays = list(D.PLAYS)
    vis = next(p for p in plays if p["key"] == "visibility")
    plays.remove(vis)
    plays.insert([p["key"] for p in plays].index("hollow_calendar"), vis)
    monkeypatch.setattr(D, "PLAYS", plays)
    after = dayplan.build(doc, wl, big, ASOF)
    a_vis, a_hol = first(after, "visibility"), first(after, "hollow_calendar")
    assert all(a_vis[o] < a_hol[o] for o in a_vis)


def test_flag_counts_match_the_team_screen(data):
    doc = data[0]
    sp = pd.read_parquet(OUT / "specialist_features.parquet")
    t = {"specialists": sp[["specialist_id", "specialist_name", "team_id", "role"]],
         "teams": pd.read_parquet(OUT / "teams.parquet")}
    esc = pd.read_parquet(OUT / "escalation_features.parquet")
    team = {r["id"]: r for r in kpi.team(t, doc, esc, ASOF)["rows"]}
    fl = doc.assign(f=[dayplan.flags(r, RULES, ASOF) for _, r in doc.iterrows()])
    pairs = [("hollow", "hollow"), ("not_found", "not_found"), ("commitment", "open_commitments"),
             ("may_cancel", "may_cancel"), ("at_risk", "at_risk")]
    for owner, row in team.items():
        mine = fl[fl.owner_specialist_id == owner].f
        for flag, col in pairs:
            assert sum(flag in f for f in mine) == row[col], (owner, flag)


def test_churned_doctors_have_no_flags(data):
    doc = data[0]
    for _, r in doc[doc.status == "churned"].head(50).iterrows():
        assert dayplan.flags(r, RULES, ASOF) == []
