// Every count links to the list of the doctors it counts (T5.2, G4): /doctores with the
// scope made explicit and the same filter Python used to count them.
import type { Flag } from "@/lib/types"

/** The KPI cards whose value is a count of active doctors carrying one flag. */
export const KPI_FLAG: Record<string, Flag> = {
  at_risk: "at_risk",
  may_cancel: "may_cancel",
  hollow: "hollow",
  not_found: "not_found",
}

/** The team table's count columns and the flag behind each. */
export const TEAM_FLAG: Record<string, Flag> = {
  at_risk: "at_risk",
  may_cancel: "may_cancel",
  hollow: "hollow",
  not_found: "not_found",
  open_commitments: "commitment",
}

/** /doctores for a scope ("all" | "team:<name>" | specialist id) and a filter. */
export function listHref(scope: string, filter: Record<string, string>): string {
  const q = new URLSearchParams()
  if (/^S\d+$/.test(scope)) q.set("owner", scope)
  else if (scope.startsWith("team:")) q.set("team", scope.slice(5))
  for (const [k, v] of Object.entries(filter)) q.set(k, v)
  return `/doctores?${q.toString()}`
}
