import numpy as np
import pandas as pd

from spc import _fixed_counts, _rules, p_chart
from i18n import L


def test_two_of_three_rule_fires_when_third_point_returns_inside_zone():
    result = _rules([2.4, 2.5, 0.1], 0, 1)
    assert "rule2" in result[2]


def test_ineligible_point_breaks_a_run():
    result = _rules([1] * 7 + [np.nan] + [1] * 7, 0, 1)
    assert not any("rule3" in flags for flags in result)


def test_baseline_is_never_replaced_with_later_periods():
    dates = pd.date_range("2026-06-26", periods=12, freq="D").strftime("%Y-%m-%d")
    frame = pd.DataFrame({"date": dates, "cases": [10] * 12, "failures": [2] * 12})
    chart = p_chart(frame, "date", "failures", "cases", L("Rate", "Tasa"))
    assert chart["available"] is False
    assert chart["baseline"]["n_points"] == 0


def test_small_conversion_week_is_visible_but_cannot_signal():
    dates = pd.date_range("2026-05-04", periods=9, freq="W-MON").strftime("%Y-%m-%d")
    frame = pd.DataFrame({"week": dates, "cases": [20] * 8 + [7], "wins": [10] * 8 + [7]})
    chart = p_chart(frame, "week", "wins", "cases", L("Conversion", "Conversión"), min_n=15)
    assert chart["available"] is True
    assert chart["excluded_points"] == 1
    assert chart["points"][-1]["value"] == 1
    assert chart["points"][-1]["signals"] == []
    assert chart["points"][-1]["eligible"] is False


def test_count_chart_input_includes_zero_event_days():
    events = pd.DataFrame({"at": pd.to_datetime(["2026-05-01", "2026-05-03"])})
    counts = _fixed_counts(events, "at", "D")
    assert counts.to_dict("records") == [
        {"period": "2026-05-01", "n": 1},
        {"period": "2026-05-02", "n": 0},
        {"period": "2026-05-03", "n": 1},
    ]
