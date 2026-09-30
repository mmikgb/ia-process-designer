"""
The qualitative analyser.

The model NAMES and GROUPS. Python COUNTS and MEASURES. The model is told not
to return counts, and every id and quote it returns is checked against the data
before anything is believed.

With no key this still produces a themes table: the rules-based tags from
notes.py, sized and ranked by their measured churn lift. That is the zero-credit
path, and it is genuinely useful on its own.

    python3 src/insight.py            # rules-only themes
    python3 src/insight.py --estimate # what an LLM pass would cost
"""
from __future__ import annotations
import json, re
from pathlib import Path
import numpy as np
import pandas as pd

import llm
import notes as N

ROOT = Path(__file__).resolve().parent.parent
BATCH = 100
CHARS_PER_TOKEN = 3.6

SYSTEM = """Eres un analista de operaciones de Customer Success. Recibes notas breves
escritas por especialistas sobre doctores en una plataforma de citas medicas.

Tu tarea: agrupar las notas en temas y nombrar cada tema.

REGLAS ESTRICTAS:
- Devuelve SOLO JSON valido: {"themes":[{"name":"...","description":"...","ids":["I000123",...]}]}
- NO devuelvas conteos, porcentajes, totales ni conclusiones. Nosotros los calculamos.
- NO inventes ids. Usa unicamente los ids que aparecen en la entrada.
- name: 4-8 palabras, concreto, en espanol.
- description: una linea, que hace o pide el doctor.
- Ignora temas que ya son obvios (saludos, confirmaciones de rutina).
- Entre 3 y 8 temas por lote."""


def measure(theme_ids: list[str], tagged: pd.DataFrame, doc: pd.DataFrame,
            all_notes: pd.DataFrame) -> dict:
    """Everything numeric about a theme is computed here, never returned by a model."""
    ids = set(theme_ids)
    hit = all_notes[all_notes.interaction_id.isin(ids)]
    docs = set(hit.doctor_id)
    d = doc[doc.doctor_id.isin(docs)]
    base = (doc.status == "churned").mean()
    churn = (d.status == "churned").mean() if len(d) else np.nan
    by_month = hit.assign(m=hit.occurred_at.dt.to_period("M").astype(str)).groupby("m").size()
    return {
        "notes": int(len(hit)), "doctors": int(len(docs)),
        "churn": round(float(churn), 3) if len(d) else None,
        "lift": round(float(churn / base), 2) if len(d) and base else None,
        "trend": [{"month": k, "n": int(v)} for k, v in by_month.items()],
        "examples": hit.note.dropna().drop_duplicates().head(3).tolist(),
    }


def rules_themes(tagged: pd.DataFrame, doc: pd.DataFrame, all_notes: pd.DataFrame) -> list[dict]:
    """The zero-credit path. Every tag in notes.py becomes a theme, measured the
    same way an LLM theme would be, and ranked by churn lift rather than size."""
    out = []
    for tag, grp in tagged[tagged.tag != "untagged"].groupby("tag"):
        m = measure(grp.interaction_id.tolist(), tagged, doc, all_notes)
        if m["notes"] < 30:
            continue
        m.update({"name": tag.replace("_", " "), "description": "rules-based tag from notes.py",
                  "source": "rules", "tag": tag})
        out.append(m)
    return sorted(out, key=lambda x: (x["lift"] or 0), reverse=True)


def llm_themes(all_notes: pd.DataFrame, tagged: pd.DataFrame, doc: pd.DataFrame,
               only_untagged: bool = True, max_batches: int | None = None) -> tuple[list[dict], dict]:
    """Ask the model to name what the rules missed. Returns (themes, audit)."""
    pool = all_notes
    if only_untagged:
        covered = set(tagged[tagged.tag != "untagged"].interaction_id)
        pool = all_notes[~all_notes.interaction_id.isin(covered)]
    uniq = pool.drop_duplicates(subset=["note"])
    valid_ids = set(all_notes.interaction_id)

    themes, audit = [], {"batches": 0, "returned": 0, "bad_ids": 0, "bad_quotes": 0, "cost": 0.0}
    batches = [uniq.iloc[i:i + BATCH] for i in range(0, len(uniq), BATCH)]
    if max_batches:
        batches = batches[:max_batches]

    for b in batches:
        payload = "\n".join(f"{r.interaction_id}: {r.note}" for r in b.itertuples())
        res = llm.call("themes", SYSTEM, payload, fallback="", max_tokens=1500)
        audit["batches"] += 1
        audit["cost"] += res.cost
        if res.source != "llm" or not res.text:
            continue
        try:
            raw = json.loads(re.search(r"\{.*\}", res.text, re.S).group(0))
        except Exception:
            continue
        for th in raw.get("themes", []):
            audit["returned"] += 1
            ids = [i for i in th.get("ids", []) if i in valid_ids]
            audit["bad_ids"] += len(th.get("ids", [])) - len(ids)
            if len(ids) < 5:
                continue
            m = measure(ids, tagged, doc, all_notes)
            m.update({"name": str(th.get("name", ""))[:80],
                      "description": str(th.get("description", ""))[:160],
                      "source": "llm", "tag": None})
            themes.append(m)
    return sorted(themes, key=lambda x: (x["lift"] or 0), reverse=True), audit


def propose_rules(themes: list[dict]) -> list[dict]:
    """A theme with a clean shared phrase becomes a candidate regex for notes.py.
    You approve it; after that the model is out of that loop permanently."""
    out = []
    for th in themes:
        if th["source"] != "llm" or not th["examples"] or (th["lift"] or 0) < 1.5:
            continue
        words = [set(re.findall(r"[a-zá-úñ]{5,}", e.lower())) for e in th["examples"]]
        common = set.intersection(*words) if len(words) > 1 else words[0]
        if not common:
            continue
        out.append({"suggested_tag": re.sub(r"\W+", "_", th["name"].lower())[:32],
                    "suggested_regex": "|".join(sorted(common)[:4]),
                    "from_theme": th["name"], "lift": th["lift"], "notes": th["notes"],
                    "status": "proposed"})
    return out


def cost_estimate(all_notes: pd.DataFrame, tagged: pd.DataFrame, doc_count: int) -> dict:
    covered = set(tagged[tagged.tag != "untagged"].interaction_id)
    uniq_all = all_notes.drop_duplicates(subset=["note"])
    uniq_un = all_notes[~all_notes.interaction_id.isin(covered)].drop_duplicates(subset=["note"])
    def toks(df):
        return int(df.note.str.len().sum() / CHARS_PER_TOKEN)
    t_all, t_un = toks(uniq_all), toks(uniq_un)
    themes_cost = llm.estimate("claude-sonnet-4-5", t_all + 600 * (len(uniq_all) // BATCH + 1),
                               1500 * (len(uniq_all) // BATCH + 1), batch=True)
    sum_in = int(doc_count * 127)
    sum_cost = llm.estimate("claude-haiku-4-5", sum_in, doc_count * 90, batch=True)
    return {
        "unique_notes_all": int(len(uniq_all)), "unique_notes_untagged": int(len(uniq_un)),
        "tokens_all": t_all, "tokens_untagged": t_un,
        "themes_usd": round(themes_cost, 3),
        "summaries_doctors": doc_count, "summaries_usd": round(sum_cost, 3),
        "total_usd": round(themes_cost + sum_cost, 3),
    }


def build(t: dict, doc: pd.DataFrame, tagged: pd.DataFrame, use_llm: bool = True) -> dict:
    inter = t["interactions"][["interaction_id", "doctor_id", "occurred_at", "note"]].dropna(subset=["note"])
    rules = rules_themes(tagged, doc, inter)
    ok, why = llm.enabled()
    res = {"rules_themes": rules, "llm_themes": [], "proposed_rules": [],
           "audit": {"llm_used": False, "reason": why}}
    if use_llm and ok:
        th, audit = llm_themes(inter, tagged, doc)
        res["llm_themes"] = th
        res["proposed_rules"] = propose_rules(th)
        res["audit"] = {"llm_used": True, **audit}
    return res


if __name__ == "__main__":
    import sys
    from pipeline import load, DATA
    t = load(DATA)
    doc = pd.read_parquet(ROOT / "out" / "doctor_features.parquet")
    tagged = N.tag_interactions(t["interactions"])
    inter = t["interactions"][["interaction_id", "doctor_id", "occurred_at", "note"]].dropna(subset=["note"])
    if "--estimate" in sys.argv:
        print(json.dumps(cost_estimate(inter, tagged, int((doc.status == "active").sum())), indent=2))
        raise SystemExit
    r = build(t, doc, tagged)
    print(f"llm used: {r['audit']['llm_used']} ({r['audit'].get('reason','')})")
    print(f"\nrules themes, ranked by measured churn lift:\n")
    print(f"{'theme':26} {'notes':>6} {'doctors':>8} {'churn':>7} {'lift':>6}")
    for th in r["rules_themes"][:15]:
        print(f"{th['name'][:26]:26} {th['notes']:6} {th['doctors']:8} "
              f"{(th['churn'] or 0):7.3f} {(th['lift'] or 0):6.2f}")
