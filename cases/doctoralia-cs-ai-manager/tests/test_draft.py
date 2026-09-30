"""draft.py: play order, thresholds from RULES, the business day, both languages."""
import re
from pathlib import Path

import pandas as pd
import pytest

import draft as D
from pipeline import RULES

SRC = Path(__file__).resolve().parent.parent / "src"


def row(**kw) -> pd.Series:
    """An active doctor with a complete record and nothing wrong, then overrides."""
    base = dict(
        doctor_id="D00001", doctor_name="Dra. Ana López", specialty="Pediatría", city="Puebla",
        status="active", onboarding_grade="A", calendar_enabled=True, weekly_slots_published=20,
        bookings_last=15.0, bookings_prev=14.0, bookings_avg=14.5, median_specialty_city=14.0,
        bottom_quartile=False, demand_constrained=False, contacts_total=5, days_since_contact=10,
        campaigns_enrolled=1, campaigns_engaged=1, complaints=0, sig_churn_threat=False,
        sig_discouraged=False, sig_whatsapp_only=False, sig_gatekeeper=False, max_attempts=1,
        commitment_open=False, open_ask=None, days_commitment_open=None,
        top_signal=None, top_signal_at=pd.Timestamp("2026-09-12"),
        top_signal_note="Está desanimado, dice que no ve resultados.",
        upsell_signal=None, upsell_note=None, upsell_at=None,
        slots_low_avg=11.3, slots_ok_avg=15.2,
    )
    base.update(kw)
    return pd.Series(base)


def test_discouraged_only_gets_a_brief():
    res = D.compose(row(sig_discouraged=True))
    assert res["play"] == "discouraged"
    assert res["mode"] == "brief"
    assert res["draft"] is None
    assert "2.28" in res["why"] and "2.28" in res["i18n"]["why"]["es"]
    assert "NO mandes" in res["i18n"]["instead"]["es"]


def test_churn_threat_wins_over_discouraged():
    res = D.compose(row(sig_discouraged=True, sig_churn_threat=True))
    assert res["play"] == "churn_threat"
    assert res["mode"] == "brief"


def test_discouraged_sits_right_after_churn_threat():
    keys = [p["key"] for p in D.PLAYS]
    assert keys.index("discouraged") == keys.index("churn_threat") + 1


def test_hollow_calendar_reads_the_rule(monkeypatch):
    r = row(weekly_slots_published=7)
    monkeypatch.setitem(RULES, "calendar_healthy_slots", 6)
    assert D.compose(r)["play"] != "hollow_calendar"
    monkeypatch.setitem(RULES, "calendar_healthy_slots", 8)
    res = D.compose(r)
    assert res["play"] == "hollow_calendar"
    assert "al menos 8 horarios" in res["i18n"]["ask"]["es"]
    assert "al menos 8 horarios" in res["draft"]


def test_hollow_calendar_gain_sentence_follows_the_table():
    res = D.compose(row(weekly_slots_published=1))
    assert "cerca de 4 citas más" in res["draft"]
    # when the table does not support a gain, the sentence is dropped, not kept stale
    flat = D.compose(row(weekly_slots_published=1, slots_low_avg=15.0, slots_ok_avg=15.2))
    assert "citas más" not in flat["draft"]


def test_next_business_day():
    assert D.next_business_day("2026-09-25") == "el lunes 28 de septiembre"   # Friday
    assert D.next_business_day("2026-09-28") == "el martes 29 de septiembre"


def test_default_slot_day_is_the_extract_business_day():
    res = D.compose(row(calendar_enabled=False))
    assert D.next_business_day(RULES["extract_date"]) in res["draft"]


def test_no_hard_coded_thursday_anywhere():
    for f in ["bundle.py", "copilot.py", "app.py", "draft.py"]:
        text = (SRC / f).read_text()
        assert '"el jueves"' not in text, f


def test_no_draft_says_thursday_on_real_doctors():
    p = SRC.parent / "out" / "doctor_features.parquet"
    if not p.exists():
        pytest.skip("run python3 src/pipeline.py first")
    doc = pd.read_parquet(p)
    for _, r in doc.iterrows():
        res = D.compose(r)
        assert "jueves" not in (res["draft"] or ""), r.doctor_id


def test_every_play_has_both_languages():
    for p in D.PLAYS:
        for k in ["why", "ask"]:
            assert p.get(k) and p.get(f"{k}_es"), (p["key"], k)
        if p["mode"] == "draft":
            assert p.get("es"), p["key"]
        else:
            assert p.get("brief") and p.get("brief_es"), p["key"]


def test_i18n_block_is_complete_for_every_outcome():
    cases = [row(), row(sig_discouraged=True), row(calendar_enabled=False),
             row(calendar_enabled=False, onboarding_grade=None, bookings_last=None,
                 contacts_total=0),
             row(status="churned", calendar_enabled=False),
             row(upsell_signal="Doctoralia Payments", upsell_note="Quiere cobrar anticipo",
                 upsell_at=pd.Timestamp("2026-09-01")),
             row(sig_whatsapp_only=True, max_attempts=5, calendar_enabled=False)]
    for r in cases:
        res = D.compose(r)
        i = res["i18n"]
        assert set(i) == {"why", "ask", "instead", "channel", "gaps"}
        for k in ["why", "ask", "instead", "channel"]:
            v = i[k]
            assert v is None or (set(v) == {"en", "es"} and v["en"] and v["es"]), (k, v)
        assert all(set(g) == {"en", "es"} for g in i["gaps"])
        # the English keys Streamlit reads mirror the English side
        assert res["why"] == (i["why"] or {}).get("en")
        if i["instead"]:
            assert res["instead"] == i["instead"]["en"]
        # nothing left unformatted
        blob = str(i) + str(res["draft"])
        assert not re.search(r"\{[a-z_]+(:[^}]*)?\}", blob), blob


def test_drafts_stay_spanish_usted():
    res = D.compose(row(calendar_enabled=False))
    assert res["draft"].startswith("Doctor López")
    assert "usted" in res["draft"] or "Le " in res["draft"] or "le " in res["draft"]
