"""notes.py: follow-ups the specialists scheduled in their own notes."""
import pandas as pd
import pytest

import notes as N

MON = pd.Timestamp("2026-09-21 10:30")   # a Monday
FRI = pd.Timestamp("2026-09-25 16:00")


@pytest.mark.parametrize("note,at,due,kind", [
    ("Sesión de arranque. Lo agendé para revisión en 4 días.", MON, "2026-09-25", "review"),
    ("Quedó de completar su descripción. Lo agendé para Revisión en 10 dias.", MON, "2026-10-01", "review"),
    ("Contesta pero no tiene tiempo esta semana. Reagendar en 9 días.", MON, "2026-09-30", "reschedule"),
    ("Sin respuesta al mensaje. Reintentar la próxima semana.", FRI, "2026-10-02", "retry"),
    ("Falta que confirme sus precios. Seguimiento el jueves.", MON, "2026-09-24", "weekday"),
    ("Falta que confirme sus precios. Seguimiento el miércoles.", FRI, "2026-09-30", "weekday"),
    ("Seguimiento el lunes.", MON, "2026-09-28", "weekday"),          # Monday -> next Monday
    ("Seguimiento el viernes.", FRI, "2026-10-02", "weekday"),
])
def test_followup_patterns(note, at, due, kind):
    got = N.followup(note, at)
    assert got == (pd.Timestamp(due), kind)


def test_two_promises_the_earlier_wins():
    # retry = +7 (Mon 28 Sep); "el viernes" after a Monday = Fri 25 Sep
    got = N.followup("Reintentar la próxima semana. Seguimiento el viernes.", MON)
    assert got == (pd.Timestamp("2026-09-25"), "weekday")


@pytest.mark.parametrize("note", ["No se conectó a la sesión de onboarding. Reagendar.",
                                  "Todo en orden, agradece el seguimiento.", None, ""])
def test_no_followup(note):
    assert N.followup(note, MON) is None


def test_only_the_latest_interaction_counts():
    inter = pd.DataFrame([
        ("I1", "D1", MON, "S01", "Lo agendé para revisión en 4 días."),
        ("I2", "D1", FRI, "S02", "Todo en orden, sin pendientes."),      # supersedes I1
        ("I3", "D2", MON, "S01", "Reagendar en 3 días."),
        ("I4", "D2", FRI, "S03", "Seguimiento el martes."),              # supersedes I3
    ], columns=["interaction_id", "doctor_id", "occurred_at", "specialist_id", "note"])
    fu = N.followups(inter)
    assert list(fu.index) == ["D2"]
    r = fu.loc["D2"]
    assert r.followup_due_at == pd.Timestamp("2026-09-29")
    assert r.followup_kind == "weekday"
    assert r.followup_set_by == "S03"
    assert r.followup_set_at == pd.Timestamp("2026-09-25")
    assert r.followup_note == "Seguimiento el martes."
