"""
Bilingual strings for the web files.

Every human-readable string that Python writes into a web file is L(en, es).
Data is never translated: doctor names, specialties, cities and notes go out as
they are. The web helper tx() accepts a plain string or {en, es}, so fields can
move over one at a time.

    from i18n import L
    L("Call today", "Llamar hoy")  ->  {"en": "Call today", "es": "Llamar hoy"}
"""
from __future__ import annotations


def L(en: str, es: str) -> dict:  # a bilingual string
    return {"en": en, "es": es}


def en(v) -> str | None:
    """The English side of a bilingual string, for Streamlit and report.py."""
    if v is None:
        return None
    return v["en"] if isinstance(v, dict) else str(v)


def pct(x: float, digits: int = 0) -> str:
    """A share as a percent, formatted once so both languages quote the same figure."""
    return f"{100 * x:.{digits}f}%"
