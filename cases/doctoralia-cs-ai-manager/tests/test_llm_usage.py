"""T4.8: the daily tool's monthly AI estimate, from USAGE_V2 and PRICES."""
import llm


def test_usage_estimate_matches_the_spec_range():
    e = llm.usage_estimate(14)
    assert [r["task"] for r in e["rows"]] == ["message", "briefing", "explain", "doctor", "ask"]
    # SPEC_Daily_Tool T4.8: roughly $3-4 per specialist a month, ~$50 for 14, before caching
    assert 3.0 <= e["per_specialist_usd"] <= 4.0
    assert 45 <= e["team_usd"] <= 56
    assert e["recommended_budget_usd"] == 75.0


def test_usage_estimate_uses_prices():
    e = llm.usage_estimate(1)
    ask = next(r for r in e["rows"] if r["task"] == "ask")
    p = llm.PRICES[llm.MODEL_DEEP]
    assert ask["usd_per_call"] == round((8000 * p["in"] + 500 * p["out"]) / 1e6, 6)
    assert abs(sum(r["usd_month"] for r in e["rows"]) - e["per_specialist_usd"]) < 0.01
