"""
The ONE entry point for every model call. Nothing in this codebase calls
Anthropic directly.

Three guarantees:
  1. It never raises. No key, no network, bad JSON, rate limit -> the caller
     gets its fallback and a logged row. No screen has a try/except.
  2. Every call writes a ledger row before returning. Cost is structural, not
     a convention someone remembers.
  3. A kill switch and a budget cap that actually stop calls.

    from llm import call, enabled, estimate, summary
"""
from __future__ import annotations
import json, os, sqlite3, time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
LEDGER = OUT / "llm_ledger.db"
SETTINGS = OUT / "settings.json"

# $ per million tokens. Source: platform.claude.com/docs/en/about-claude/pricing
PRICES = {
    "claude-haiku-4-5":  {"in": 1.0, "out": 5.0},
    "claude-sonnet-4-5": {"in": 2.0, "out": 10.0},
    "claude-opus-4-5":   {"in": 4.0, "out": 20.0},
}
DEFAULT_MODEL = "claude-haiku-4-5"
BATCH_DISCOUNT = 0.5


@dataclass
class Result:
    text: str
    source: str          # "llm" | "fallback:<reason>"
    cost: float
    tokens_in: int
    tokens_out: int


def _db():
    OUT.mkdir(exist_ok=True)
    c = sqlite3.connect(LEDGER)
    c.execute("""CREATE TABLE IF NOT EXISTS calls(
        ts REAL, task TEXT, model TEXT, tokens_in INT, tokens_out INT,
        cached_in INT, cost REAL, batch INT, ok INT, source TEXT,
        specialist TEXT, doctor TEXT)""")
    return c


def settings() -> dict:
    d = {"ai_enabled": False, "monthly_budget_usd": 25.0,
         "model_by_task": {"themes": "claude-sonnet-4-5", "summary": DEFAULT_MODEL,
                           "polish": DEFAULT_MODEL, "ask": DEFAULT_MODEL}}
    if SETTINGS.exists():
        try:
            d.update(json.loads(SETTINGS.read_text()))
        except Exception:
            pass
    return d


def save_settings(d: dict) -> None:
    OUT.mkdir(exist_ok=True)
    s = settings()
    s.update(d)
    SETTINGS.write_text(json.dumps(s, indent=2))


def api_key() -> str | None:
    """Keychain first, environment second. The key is never written to the
    bundle and never printed beyond its last four characters."""
    try:
        import keyring
        k = keyring.get_password("cs-control-room", "anthropic")
        if k:
            return k
    except Exception:
        pass
    return os.environ.get("ANTHROPIC_API_KEY")


def set_api_key(k: str) -> str:
    try:
        import keyring
        keyring.set_password("cs-control-room", "anthropic", k)
        return "keychain"
    except Exception:
        os.environ["ANTHROPIC_API_KEY"] = k
        return "session only (install `keyring` to persist)"


def month_spend() -> float:
    c = _db()
    since = time.time() - 30 * 86400
    v = c.execute("SELECT COALESCE(SUM(cost),0) FROM calls WHERE ts > ?", (since,)).fetchone()[0]
    c.close()
    return float(v)


def enabled() -> tuple[bool, str]:
    s = settings()
    if not s.get("ai_enabled"):
        return False, "AI features are switched off in settings"
    if not api_key():
        return False, "no API key configured"
    if month_spend() >= s.get("monthly_budget_usd", 25.0):
        return False, f"monthly budget of ${s['monthly_budget_usd']:.2f} reached"
    return True, "ready"


def price(model: str, tin: int, tout: int, batch: bool = False) -> float:
    p = PRICES.get(model, PRICES[DEFAULT_MODEL])
    c = tin / 1e6 * p["in"] + tout / 1e6 * p["out"]
    return round(c * (BATCH_DISCOUNT if batch else 1.0), 6)


def estimate(model: str, tin: int, tout: int, batch: bool = False) -> float:
    """What a job will cost, shown before it runs."""
    return price(model, tin, tout, batch)


def _log(task, model, tin, tout, cost, batch, ok, source, specialist=None, doctor=None):
    c = _db()
    c.execute("INSERT INTO calls VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
              (time.time(), task, model, tin, tout, 0, cost, int(batch), int(ok),
               source, specialist, doctor))
    c.commit()
    c.close()


def call(task: str, system: str, user: str, *, fallback: str = "",
         model: str | None = None, max_tokens: int = 800,
         specialist: str | None = None, doctor: str | None = None) -> Result:
    """Never raises. Returns the fallback with a reason when it cannot call."""
    model = model or settings()["model_by_task"].get(task, DEFAULT_MODEL)
    ok, why = enabled()
    if not ok:
        _log(task, model, 0, 0, 0.0, False, 0, f"fallback:{why}", specialist, doctor)
        return Result(fallback, f"fallback:{why}", 0.0, 0, 0)
    try:
        import anthropic
        cl = anthropic.Anthropic(api_key=api_key())
        m = cl.messages.create(model=model, max_tokens=max_tokens, system=system,
                               messages=[{"role": "user", "content": user}])
        tin, tout = m.usage.input_tokens, m.usage.output_tokens
        cost = price(model, tin, tout)
        _log(task, model, tin, tout, cost, False, 1, "llm", specialist, doctor)
        return Result(m.content[0].text.strip(), "llm", cost, tin, tout)
    except Exception as e:
        r = f"fallback:{type(e).__name__}"
        _log(task, model, 0, 0, 0.0, False, 0, r, specialist, doctor)
        return Result(fallback, r, 0.0, 0, 0)


def summary(days: int = 30) -> dict:
    """What the cost screen reads."""
    c = _db()
    since = time.time() - days * 86400
    rows = c.execute("""SELECT task, model, COUNT(*), SUM(tokens_in), SUM(tokens_out),
                        SUM(cost), SUM(ok) FROM calls WHERE ts > ? GROUP BY task, model""",
                     (since,)).fetchall()
    tot = c.execute("SELECT COUNT(*), COALESCE(SUM(cost),0), SUM(ok) FROM calls WHERE ts > ?",
                    (since,)).fetchone()
    per_spec = c.execute("""SELECT specialist, COUNT(*), COALESCE(SUM(cost),0) FROM calls
                            WHERE ts > ? AND specialist IS NOT NULL GROUP BY specialist""",
                         (since,)).fetchall()
    c.close()
    s = settings()
    return {
        "days": days, "calls": tot[0] or 0, "spend": round(tot[1] or 0.0, 4),
        "fallbacks": (tot[0] or 0) - (tot[2] or 0),
        "budget": s.get("monthly_budget_usd", 25.0),
        "budget_used": round((tot[1] or 0) / max(s.get("monthly_budget_usd", 25.0), 1e-9), 3),
        "by_task": [{"task": r[0], "model": r[1], "calls": r[2], "tokens_in": r[3] or 0,
                     "tokens_out": r[4] or 0, "cost": round(r[5] or 0, 4), "ok": r[6] or 0}
                    for r in rows],
        "by_specialist": [{"specialist": r[0], "calls": r[1], "cost": round(r[2], 4)}
                          for r in per_spec],
    }
