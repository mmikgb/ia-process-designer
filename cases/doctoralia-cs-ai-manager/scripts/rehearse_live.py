"""T6.2 rehearsal, steps 5 and 6: edit PLAYS / RULES, rebuild the bundle, measure the day, restore.

Run from the case folder: python3 scripts/rehearse_live.py. Every edit is undone and the script
checks the bundle comes back identical. With pnpm dev running, the open page follows each rebuild."""
import json, shutil, subprocess, sys
from collections import Counter
from pathlib import Path

ROOT = Path.cwd()
OUT = ROOT / "out"

def snap():
    q = {p.stem: json.loads(p.read_text()) for p in sorted((OUT / "queue").glob("*.json"))}
    msgs = Counter(x["play"] for f in q.values() for x in f["items"] if x["block"] == "message")
    s01 = [(x["doctor_name"], x["play"]) for x in q["S01"]["items"] if x["block"] == "message"]
    ov = json.loads((OUT / "overview.json").read_text())
    hollow = {r["id"]: r["hollow"] for r in ov["team"]["rows"]}
    counts = {k: sum(f["counts"][k] for f in q.values()) for k in ["call", "followup", "message", "handoff", "later"]}
    return {"messages_by_play": dict(msgs), "S01_messages": s01, "hollow_total": sum(hollow.values()),
            "not_found_total": sum(r["not_found"] for r in ov["team"]["rows"]), "counts": counts}

def build():
    # no bytecode: a file restored in the same second with the same size would otherwise run
    # the edited version's .pyc (Python checks mtime to the second, and size)
    shutil.rmtree(ROOT / "src" / "__pycache__", ignore_errors=True)
    r = subprocess.run([sys.executable, "-B", "src/bundle.py"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]

def edit(path, fn):
    p = ROOT / path
    bak = p.with_suffix(p.suffix + ".bak")
    shutil.copyfile(p, bak)
    p.write_text(fn(p.read_text()))
    return p, bak

def hollow_first(s):
    a = s.index('    dict(\n        key="open_commitment"')
    h0 = s.index('    dict(\n        key="hollow_calendar"')
    h1 = s.index('    dict(\n        key="complaint_no_patients"')
    blk = s[h0:h1]
    s = s[:h0] + s[h1:]
    return s[:a] + blk + s[a:]


def move_visibility(s):
    a = s.index('    dict(\n        key="hollow_calendar"')
    v0 = s.index('    dict(\n        key="visibility"')
    v1 = s.index('    dict(\n        key="calendar_off"')
    vis = s[v0:v1]
    s = s[:v0] + s[v1:]
    return s[:a] + vis + s[a:]

base = snap()
for step, path, fn in [
    ("5: visibility above hollow_calendar in PLAYS", "src/draft.py", move_visibility),
    ("5b: hollow_calendar above open_commitment in PLAYS", "src/draft.py", hollow_first),
    ("6: calendar_healthy_slots 6 -> 8", "src/pipeline.py",
     lambda s: s.replace('"calendar_healthy_slots": 6,', '"calendar_healthy_slots": 8,', 1)),
]:
    p, bak = edit(path, fn)
    try:
        build()
        after = snap()
    finally:
        shutil.move(bak, p)
    print(f"== step {step}")
    print("  messages by play:", base["messages_by_play"], "->", after["messages_by_play"])
    print("  S01 Mensajes:", [pl for _, pl in base["S01_messages"]], "->", [pl for _, pl in after["S01_messages"]])
    print("  hollow (team):", base["hollow_total"], "->", after["hollow_total"],
          "| not found:", base["not_found_total"], "->", after["not_found_total"])
    print("  block counts:", base["counts"], "->", after["counts"])
build()
assert snap() == base, "restore did not bring the bundle back"
print("restored: bundle identical to before")
