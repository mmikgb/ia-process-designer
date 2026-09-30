// out/settings.json, shared with src/llm.py. llm.py owns ai_enabled (build-time
// enrichment, off by default); the web owns ai_runtime_enabled (defaults to on when a
// key exists). monthly_budget_usd is one budget for both.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { OUT } from "@/lib/server/paths"

const FILE = path.join(OUT, "settings.json")

export interface Settings {
  ai_enabled?: boolean
  ai_runtime_enabled?: boolean
  monthly_budget_usd: number
  [k: string]: unknown
}

export async function readSettings(): Promise<Settings> {
  try {
    return { monthly_budget_usd: 25, ...(JSON.parse(await readFile(FILE, "utf8")) as Partial<Settings>) }
  } catch {
    return { monthly_budget_usd: 25 }
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch }
  await mkdir(OUT, { recursive: true })
  await writeFile(FILE, JSON.stringify(next, null, 2))
  return next
}
