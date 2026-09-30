// One row per AI call from the web, in out/llm_ledger_web.jsonl. src/llm.py adds this
// file to its own ledger when it checks the monthly budget, so the budget is shared.
import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { OUT } from "@/lib/server/paths"

const FILE = path.join(OUT, "llm_ledger_web.jsonl")

export interface LedgerRow {
  ts: string
  task: string
  model: string
  tokens_in: number
  tokens_out: number
  cache_read: number
  cost: number
  ok: boolean
  source: string
  owner: string | null
  doctor: string | null
  prompt_version: string
}

export async function writeLedger(row: LedgerRow): Promise<void> {
  try {
    await mkdir(OUT, { recursive: true })
    await appendFile(FILE, JSON.stringify(row) + "\n")
  } catch {
    // the ledger must never break a screen; a lost row shows up as a gap in the count
  }
}

export async function readLedger(days = 30): Promise<LedgerRow[]> {
  const since = Date.now() - days * 864e5
  try {
    const text = await readFile(FILE, "utf8")
    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as LedgerRow]
        } catch {
          return []
        }
      })
      .filter((r) => Date.parse(r.ts) >= since)
  } catch {
    return []
  }
}

export async function spend(days = 30): Promise<number> {
  return (await readLedger(days)).reduce((s, r) => s + (r.cost || 0), 0)
}
