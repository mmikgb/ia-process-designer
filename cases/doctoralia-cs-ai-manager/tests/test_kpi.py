"""kpi.py: sample sizes, suppression and notes that agree across screens.
Reads the last build (python3 src/bundle.py)."""
import json
import re
from pathlib import Path

import pytest

from pipeline import RULES

BUNDLE = Path(__file__).resolve().parent.parent / "out" / "app_data.json"
RATES = {"sla", "conversion", "grade_d"}


@pytest.fixture(scope="module")
def b():
    if not BUNDLE.exists():
        pytest.skip("run python3 src/bundle.py first")
    return json.loads(BUNDLE.read_text())


def test_no_rate_on_a_small_sample(b):
    min_n = RULES["min_n_rate"]
    checked = 0
    for scope, v in b["scopes"].items():
        for period, k in v["periods"].items():
            for kpi in k["kpis"]:
                if kpi["key"] not in RATES:
                    continue
                checked += 1
                if kpi["n"] < min_n:
                    assert kpi["value"] is None and kpi["delta_pct"] is None, (scope, period, kpi)
                    assert str(kpi["n"]) in kpi["suppressed"]["es"]
                else:
                    assert "suppressed" not in kpi
    assert checked


def test_some_specialist_rate_is_suppressed(b):
    # S10 had 5 escalations in 30 days and used to show 100% conversion
    k = {x["key"]: x for x in b["scopes"]["S10"]["periods"]["30"]["kpis"]}
    assert k["conversion"]["n"] < RULES["min_n_rate"]
    assert k["conversion"]["value"] is None


def test_overview_note_and_team_screen_agree_on_conversion(b):
    fast = next(x for x in b["team"]["buckets"] if x["bucket"] == "<30m")["converted"]
    figure = f"{100 * fast:.0f}%"
    for scope in ["all", "S01", "S10"]:
        for period in ["30", "90"]:
            k = {x["key"]: x for x in b["scopes"][scope]["periods"][period]["kpis"]}
            note = k["conversion"]["note"]
            assert note["en"].startswith(figure) and note["es"].startswith(figure)


def test_labels_and_notes_are_bilingual_and_quote_rules(b):
    k = {x["key"]: x for x in b["kpi"]["kpis"]}
    for x in k.values():
        assert set(x["label"]) == {"en", "es"} and set(x["note"]) == {"en", "es"}
    assert str(RULES["escalation_pickup_target_min"]) in k["sla"]["label"]["es"]
    assert str(RULES["calendar_healthy_slots"]) in k["hollow"]["note"]["es"]
    assert not re.search(r"\b54%", json.dumps(b["kpi"]))
