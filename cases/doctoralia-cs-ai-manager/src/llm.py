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
WEB_LEDGER = OUT / "llm_ledger_web.jsonl"     # written by web/lib/server/ledger.ts
SETTINGS = OUT / "settings.json"

# $ per million tokens. Source: platform.claude.com/docs/en/about-claude/pricing and
# /about-claude/models/overview (checked 2026-09-30; batch is 50% of these).
# The 4.5-generation rows stay so old ledger rows keep their price; claude-sonnet-4-5 is
# on the deprecation schedule (retirement not sooner than 2026-09-29).
PRICES = {
    "claude-haiku-4-5-20251001": {"in": 1.0, "out": 5.0},
    "claude-sonnet-5-5":         {"in": 2.0, "out": 10.0},
    "claude-opus-5-5":           {"in": 4.0, "out": 20.0},
    "claude-haiku-4-5":          {"in": 1.0, "out": 5.0},
    "claude-sonnet-4-5":         {"in": 3.0, "out": 15.0},
    "claude-opus-4-5":           {"in": 5.0, "out": 25.0},
}
MODEL_FAST = "claude-haiku-4-5-20251001"   # summaries, polish, ask
MODEL_DEEP = "claude-sonnet-5-5"           # themes
DEFAULT_MODEL = MODEL_FAST
# A model saved in out/settings.json before the move keeps working as its successor.
REPLACED = {"claude-sonnet-4-5": MODEL_DEEP, "claude-haiku-4-5": MODEL_FAST,
            "claude-opus-4-5": "claude-opus-5-5"}
BATCH_DISCOUNT = 0.5

# The daily tool's AI use per specialist (SPEC_Daily_Tool T4.8). The web tasks run these;
# the estimate below is the only place the monthly figure is computed.
WORKING_DAYS = 21
RECOMMENDED_BUDGET_USD = 75.0   # for 14 specialists; settings.json keeps 25 for the demo
USAGE_V2 = [
    # task, tier, calls per specialist per day, tokens in, tokens out, note
    ("message", "fast", 10, 1200, 200, None),
    ("briefing", "fast", 1, 3000, 300, "cached"),
    ("explain", "fast", 3, 1500, 150, None),
    ("doctor", "deep", 5, 4000, 700, None),
    ("ask", "deep", 3, 8000, 500, "context cached"),
]


def usage_estimate(specialists: int, days: int = WORKING_DAYS) -> dict:
    """Monthly cost of the daily tool from USAGE_V2 and PRICES, before prompt-cache savings."""
    model = {"fast": MODEL_FAST, "deep": MODEL_DEEP}
    rows = []
    for task, tier, per_day, tin, tout, note in USAGE_V2:
        call = price(model[tier], tin, tout)
        rows.append({"task": task, "tier": tier, "model": model[tier], "per_day": per_day,
                     "tokens_in": tin, "tokens_out": tout, "note": note,
                     "usd_per_call": round(call, 6),
                     "usd_month": round(call * per_day * days, 4)})
    per = sum(r["usd_month"] for r in rows)
    return {"rows": rows, "working_days": days, "specialists": specialists,
            "per_specialist_usd": round(per, 2), "team_usd": round(per * specialists, 2),
            "recommended_budget_usd": RECOMMENDED_BUDGET_USD}


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
         "model_by_task": {"themes": MODEL_DEEP, "summary": DEFAULT_MODEL,
                           "polish": DEFAULT_MODEL, "ask": DEFAULT_MODEL}}
    if SETTINGS.exists():
        try:
            saved = json.loads(SETTINGS.read_text())
            tasks = {**d["model_by_task"], **saved.pop("model_by_task", {})}
            d.update(saved)
            d["model_by_task"] = {k: REPLACED.get(v, v) for k, v in tasks.items()}
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


def web_rows(days: int = 30) -> list[dict]:
    """The web app's AI calls (one JSON line each). One budget covers both sides."""
    if not WEB_LEDGER.exists():
        return []
    since = time.time() - days * 86400
    out = []
    for line in WEB_LEDGER.read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(line)
            ts = time.mktime(time.strptime(r["ts"][:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
        except (ValueError, KeyError):
            continue
        if ts > since:
            out.append(r)
    return out


def month_spend() -> float:
    c = _db()
    since = time.time() - 30 * 86400
    v = c.execute("SELECT COALESCE(SUM(cost),0) FROM calls WHERE ts > ?", (since,)).fetchone()[0]
    c.close()
    return float(v) + sum(float(r.get("cost") or 0) for r in web_rows(30))


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
        # Current models may put a thinking block first; only text blocks are the answer.
        text = "".join(b.text for b in m.content if b.type == "text").strip()
        if m.stop_reason == "refusal" or not text:
            r = f"fallback:{m.stop_reason or 'empty'}"
            _log(task, model, tin, tout, cost, False, 0, r, specialist, doctor)
            return Result(fallback, r, cost, tin, tout)
        _log(task, model, tin, tout, cost, False, 1, "llm", specialist, doctor)
        return Result(text, "llm", cost, tin, tout)
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
    web = web_rows(days)
    web_spend = sum(float(r.get("cost") or 0) for r in web)
    web_fb = sum(1 for r in web if str(r.get("source", "")).startswith("fallback"))
    by_web: dict[tuple, list] = {}
    for r in web:
        by_web.setdefault((f"web:{r.get('task')}", r.get("model")), []).append(r)
    rows = list(rows) + [(k[0], k[1], len(v), sum(x.get("tokens_in", 0) for x in v),
                          sum(x.get("tokens_out", 0) for x in v), sum(x.get("cost", 0) for x in v),
                          sum(1 for x in v if x.get("ok"))) for k, v in by_web.items()]
    tot = ((tot[0] or 0) + len(web), (tot[1] or 0) + web_spend, (tot[2] or 0) + len(web) - web_fb)
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
