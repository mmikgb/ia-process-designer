// Reading out/work_log.jsonl on the server (the route appends; the AI context reads).
import { readFile } from "node:fs/promises"
import path from "node:path"
import { OUT } from "@/lib/server/paths"
import type { WorkEvent } from "@/lib/work"

export const WORK_LOG = path.join(OUT, "work_log.jsonl")

export async function readWorkLog(owner?: string | null): Promise<WorkEvent[]> {
  try {
    const text = await readFile(WORK_LOG, "utf8")
    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as WorkEvent]
        } catch {
          return [] // a torn line never takes the log down
        }
      })
      .filter((e) => !owner || e.owner === owner)
  } catch {
    return []
  }
}
