"""bundle.py web files: queues, search and dossiers match SPEC §5. Reads out/ after a build."""
import json
from pathlib import Path

import pytest

from pipeline import RULES

OUT = Path(__file__).resolve().parent.parent / "out"
ITEM_KEYS = {"doctor_id", "doctor_name", "specialty", "city", "block", "rank", "play", "mode",
             "reason", "risk_score", "confident"}


@pytest.fixture(scope="module")
def files():
    if not (OUT / "search.json").exists():
        pytest.skip("run python3 src/bundle.py first")
    queues = {p.stem: json.loads(p.read_text()) for p in (OUT / "queue").glob("*.json")}
    dossiers = [d for p in (OUT / "doctors").glob("*.json") for d in json.loads(p.read_text())]
    return queues, json.loads((OUT / "search.json").read_text()), dossiers


def test_one_queue_per_farming_specialist(files):
    queues = files[0]
    assert sorted(queues) == [f"S{i:02d}" for i in range(1, 15)]
    for owner, q in queues.items():
        assert q["owner"] == owner and q["asof"] == RULES["extract_date"]
        assert q["capacity"] == RULES["daily_capacity"]
        assert q["followup_quota"] == RULES["daily_followup_quota"]
        for x in q["items"]:
            assert ITEM_KEYS <= set(x), set(x) ^ ITEM_KEYS


def test_search_has_every_doctor_and_short_keys(files):
    search, dossiers = files[1], files[2]
    assert len(search) == len(dossiers) == 5571
    required = {"i", "n", "s", "c", "o", "p", "m", "r", "f"}
    optional = {"st", "lc", "fu", "a"}    # left out when empty ("st" when active)
    nullable = {"b", "pm"}                # bookings a month and the peer median: left out when unknown, 0 is real
    assert all(required <= set(x) <= required | optional | nullable for x in search)
    assert all(x[k] not in (None, 0) for x in search for k in optional if k in x)
    assert all(x[k] is not None for x in search for k in nullable if k in x)
    assert {x.get("st", "active") for x in search} == {"active", "churned"}
    assert not any(x.get("st") == "active" for x in search)
    assert (OUT / "search.json").stat().st_size < 1_000_000


def test_dossier_additions(files):
    dossiers = files[2]
    d = next(x for x in dossiers if x["followup"])
    for k in ["campaigns", "escalations", "followup", "flags", "risk_reasons_i18n",
              "bookings_last", "bookings_prev", "contacts"]:
        assert k in d
    assert set(d["copilot"]["i18n"]) == {"why", "ask", "instead", "channel", "gaps"}
    many = [x for x in dossiers if "contacts_all" in x]
    assert many and all(len(x["contacts_all"]) > 6 and x["contacts"] == x["contacts_all"][:6]
                        for x in many)
    assert all(len(x["contacts"]) <= 6 for x in dossiers)
    # converted is null when no outcome was recorded, never coerced to false
    assert any(c["converted"] is None for x in dossiers for c in x["campaigns"])


def test_flags_agree_between_search_and_dossiers(files):
    search, dossiers = files[1], files[2]
    from dayplan import FLAGS          # search.json "f" is a bitmask in this order
    f = {x["doctor_id"]: x["flags"] for x in dossiers}
    assert all(f[r["i"]] == [k for n, k in enumerate(FLAGS) if r["f"] >> n & 1] for r in search)


def test_read_work_log_applies_undo(tmp_path, monkeypatch):
    import state
    log = tmp_path / "work_log.jsonl"
    rows = [{"id": "w1", "owner": "S01", "doctor_id": "D1", "outcome": "sent"},
            {"id": "w2", "owner": "S01", "doctor_id": "D2", "outcome": "no_answer"},
            {"id": "w3", "owner": "S02", "doctor_id": "D3", "outcome": "agreed"},
            {"id": "w4", "owner": "S01", "doctor_id": "D2", "outcome": "undo", "undo_of": "w2"}]
    log.write_text("\n".join(json.dumps(r) for r in rows) + "\n{torn")
    monkeypatch.setattr(state, "WORK_LOG", log)
    assert [e["id"] for e in state.read_work_log()] == ["w1", "w3"]
    assert [e["id"] for e in state.read_work_log("S01")] == ["w1"]


def test_llm_budget_includes_the_web_ledger(tmp_path, monkeypatch):
    import datetime as dt
    import llm
    monkeypatch.setattr(llm, "OUT", tmp_path)
    monkeypatch.setattr(llm, "LEDGER", tmp_path / "llm_ledger.db")
    monkeypatch.setattr(llm, "SETTINGS", tmp_path / "settings.json")
    web = tmp_path / "llm_ledger_web.jsonl"
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    web.write_text(json.dumps({"ts": now, "task": "message", "model": "claude-haiku-4-5-20251001",
                               "tokens_in": 1200, "tokens_out": 200, "cost": 0.0022, "ok": True,
                               "source": "llm"}) + "\n" +
                   json.dumps({"ts": "2020-01-01T00:00:00.000Z", "task": "ask", "cost": 9.0,
                               "source": "llm", "ok": True}) + "\n")
    monkeypatch.setattr(llm, "WEB_LEDGER", web)
    assert abs(llm.month_spend() - 0.0022) < 1e-9
    s = llm.summary(30)
    assert s["calls"] == 1 and abs(s["spend"] - 0.0022) < 1e-4
    assert s["by_task"][0]["task"] == "web:message"


def test_overview_carries_the_web_schema():
    """web/scripts/sync-data.mjs compares this number to refuse a stale out/."""
    import bundle
    p = OUT / "overview.json"
    if not p.exists():
        pytest.skip("run python3 src/bundle.py first")
    meta = json.loads(p.read_text())["meta"]
    assert meta["web_schema"] == bundle.WEB_SCHEMA
    committed = Path(__file__).resolve().parent.parent / "web" / "data" / "overview.json"
    assert json.loads(committed.read_text())["meta"]["web_schema"] <= bundle.WEB_SCHEMA
