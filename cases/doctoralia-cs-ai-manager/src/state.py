"""
Working state: done, snoozed, edited drafts. Survives a bundle rebuild, which
is the whole point — rebuild wipes out/, so this lives in its own file and is
keyed by doctor, never by row position.
"""
from __future__ import annotations
import json, sqlite3, time
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "out" / "state.db"


def _c():
    DB.parent.mkdir(exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS work(
        doctor_id TEXT PRIMARY KEY, action TEXT, ts REAL, until REAL, note TEXT)""")
    return c


def mark(doctor_id: str, action: str, snooze_days: int = 0, note: str = "") -> None:
    c = _c()
    until = time.time() + snooze_days * 86400 if snooze_days else 0
    c.execute("INSERT OR REPLACE INTO work VALUES(?,?,?,?,?)",
              (doctor_id, action, time.time(), until, note))
    c.commit(); c.close()


def clear(doctor_id: str) -> None:
    c = _c(); c.execute("DELETE FROM work WHERE doctor_id=?", (doctor_id,)); c.commit(); c.close()


def state(doctor_id: str) -> dict | None:
    c = _c()
    r = c.execute("SELECT action, ts, until FROM work WHERE doctor_id=?", (doctor_id,)).fetchone()
    c.close()
    if not r:
        return None
    if r[0] == "snooze" and r[2] and time.time() > r[2]:
        return None
    return {"action": r[0], "at": r[1], "until": r[2]}


def is_done(doctor_id: str) -> bool:
    s = state(doctor_id)
    return bool(s and s["action"] == "done")


def hidden() -> set[str]:
    """Doctors that should drop out of the queue today."""
    c = _c()
    rows = c.execute("SELECT doctor_id, action, until FROM work").fetchall()
    c.close()
    now = time.time()
    return {d for d, a, u in rows if a == "done" or (a == "snooze" and u and u > now)}


def counts() -> dict:
    c = _c()
    r = dict(c.execute("SELECT action, COUNT(*) FROM work GROUP BY action").fetchall())
    c.close()
    return r


# --- the web app's outcome log (out/work_log.jsonl, written by web /api/work) ---
WORK_LOG = DB.parent / "work_log.jsonl"


def read_work_log(owner: str | None = None) -> list[dict]:
    """Every outcome logged in the web app, oldest first, undo events applied: an
    event reverted by an undo is dropped, and so is the undo itself. Streamlit and
    report.py read the same outcomes the web app wrote."""
    if not WORK_LOG.exists():
        return []
    events = []
    for line in WORK_LOG.read_text(encoding="utf-8").splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            continue                        # a torn line never takes the log down
    gone = {e.get("undo_of") for e in events if e.get("outcome") == "undo"}
    return [e for e in events if e.get("outcome") != "undo" and e.get("id") not in gone
            and (owner is None or e.get("owner") == owner)]
