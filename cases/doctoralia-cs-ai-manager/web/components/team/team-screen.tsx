"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ExplainButton } from "@/components/ai/explain"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import { TEAM_FLAG, listHref } from "@/lib/lists"
import type { OverviewData, TeamRow } from "@/lib/types"

const pct = (v: number | null) => (v == null ? "—" : formatPercent(v, 0))

/** Same y-axis for every specialist, so the outlier is visible without reading numbers. */
function PickupStrip({ values, max, target }: { values: (number | null)[]; max: number; target: number }) {
  const W = 120
  const H = 28
  const x = (i: number) => (i * (W - 4)) / Math.max(values.length - 1, 1) + 2
  const y = (v: number) => H - 2 - (Math.min(v, max) / max) * (H - 4)
  const pts = values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
  // break the line where a week had no escalation
  const segs: string[] = []
  let cur = ""
  for (const p of pts) {
    if (!p) {
      if (cur) segs.push(cur)
      cur = ""
    } else cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`
  }
  if (cur) segs.push(cur)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[120px]" aria-hidden>
      <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="var(--color-muted-foreground)" strokeDasharray="2 2" strokeWidth={0.75} />
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--color-chart-1)" strokeWidth={1.5} />
      ))}
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={1.5} fill="var(--color-chart-1)" />)}
    </svg>
  )
}

export function TeamScreen({ data }: { data: OverviewData }) {
  const { team } = data
  const [which, setWhich] = useState<string>("all")
  const rows = useMemo(() => team.rows.filter((r) => which === "all" || r.team === which), [team.rows, which])
  // One shared scale, capped at 4x the target so a single 4-hour week does not flatten everyone else;
  // weeks above the cap sit on the top edge.
  const maxPickup = useMemo(
    () =>
      Math.min(
        Math.max(...team.rows.flatMap((r) => r.pickup_weeks.filter((v): v is number => v != null)), team.target_min * 2),
        team.target_min * 4,
      ),
    [team.rows, team.target_min],
  )
  const maxShare = Math.max(...team.rows.map((r) => r.at_risk_share ?? 0), 0.01)
  const maxBucket = Math.max(...team.buckets.map((b) => b.converted), 0.01)

  // Every count is a link to exactly the doctors it counts (T5.2).
  const Count = ({ r, k, label }: { r: TeamRow; k: keyof typeof TEAM_FLAG & keyof TeamRow; label: string }) => {
    const v = r[k] as number
    return (
      <Link
        href={listHref(r.id, { flag: TEAM_FLAG[k] })}
        data-count={`${r.id}:${k}`}
        aria-label={`${label}: ${v}, ${r.name}`}
        className="rounded px-1 font-medium tabular-nums text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {v.toLocaleString("en-US")}
      </Link>
    )
  }

  const fast = team.buckets[0]
  const slow = team.buckets[team.buckets.length - 1]

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Where is the work, and who needs help?</h2>
        {fast && slow && (
          <p className="max-w-3xl text-sm text-foreground text-pretty">
            Escalations answered inside {team.target_min} minutes convert at{" "}
            <span className="font-semibold tabular-nums">{formatPercent(fast.converted, 0)}</span>; after two hours,{" "}
            <span className="font-semibold tabular-nums">{formatPercent(slow.converted, 0)}</span>. That gap, not
            conversation quality, is where conversion goes.
          </p>
        )}
        <div role="radiogroup" aria-label="Team" className="inline-flex w-fit flex-wrap rounded-lg border border-input bg-background p-0.5">
          {["all", ...data.teams].map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={which === t}
              onClick={() => setWhich(t)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                which === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All teams" : t.replace("Farming ", "")}
            </button>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Work in each book</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">
            Active doctors only. Every count opens exactly those doctors.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Specialist</th>
                <th className="py-2 pr-3 text-right font-medium">Portfolio</th>
                <th className="py-2 pr-3 font-medium">At risk</th>
                <th className="py-2 pr-3 text-right font-medium">May cancel</th>
                <th className="py-2 pr-3 text-right font-medium">Agenda too thin</th>
                <th className="py-2 pr-3 text-right font-medium">Not being found</th>
                <th className="py-2 text-right font-medium">Open commitments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      {r.name}
                      <ExplainButton kind="team_row" itemKey={r.id} label={r.name} />
                    </span>
                    <span className="block text-xs text-muted-foreground">{r.team.replace("Farming ", "")}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.portfolio}</td>
                  <td className="py-2 pr-3">
                    {/* workload balance: share of the book at risk, same scale for everyone */}
                    <div className="flex items-center gap-2">
                      <Count r={r} k="at_risk" label="At risk" />
                      <div className="h-1.5 w-20 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-foreground/60" style={{ width: `${((r.at_risk_share ?? 0) / maxShare) * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{pct(r.at_risk_share)}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Count r={r} k="may_cancel" label="May cancel" />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Count r={r} k="hollow" label="Agenda too thin" />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Count r={r} k="not_found" label="Not being found" />
                  </td>
                  <td className="py-2 text-right">
                    <Count r={r} k="open_commitments" label="Open commitments" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-3 text-xs text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">Agenda too thin</span> — fewer than{" "}
            {data.rules.calendar_healthy_slots} slots published; the fix is to open more.{" "}
            <span className="font-medium text-foreground">Not being found</span> — plenty of slots, still below their
            peers. Telling that group to publish more is the one thing guaranteed not to work.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-1">
            <CardTitle>Escalation pickup</CardTitle>
            <p className="text-sm text-muted-foreground text-pretty">
              Read the last two columns together: the spread in Converted disappears in When fast. Under{" "}
              {team.min_escalations} escalations a specialist gets a count and no percentage.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Specialist</th>
                  <th className="py-2 pr-3 text-right font-medium">Escalations</th>
                  <th className="py-2 pr-3 font-medium">Median pickup, last 12 weeks</th>
                  <th className="py-2 pr-3 text-right font-medium">Inside {team.target_min}m</th>
                  <th className="py-2 pr-3 text-right font-medium">Converted</th>
                  <th className="py-2 text-right font-medium">When fast</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.name.split(" ").slice(0, 2).join(" ")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.escalations}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {r.escalations >= team.min_escalations ? (
                          <PickupStrip values={r.pickup_weeks} max={maxPickup} target={team.target_min} />
                        ) : (
                          <span className="w-[120px] text-xs text-muted-foreground">too few to draw</span>
                        )}
                        <span className="tabular-nums text-foreground">{r.median_pickup == null ? "—" : `${r.median_pickup.toFixed(0)}m`}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(r.within_target)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pct(r.converted)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{r.escalations < team.min_escalations ? `n=${r.escalations}` : pct(r.converted_when_fast)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-3 text-xs text-muted-foreground">
              Dashed line in each strip: the {team.target_min}-minute target. Same scale for every row, capped at {team.target_min * 4} minutes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion by pickup time</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {team.buckets.map((b) => (
              <div key={b.bucket} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground">{b.bucket}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatPercent(b.converted, 0)} <span className="text-xs font-normal text-muted-foreground">n={b.n}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${(b.converted / maxBucket) * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground text-pretty">
              {team.unowned.n} escalations had no person attached (
              {Object.entries(team.unowned.by_queue)
                .map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`)
                .join(", ")}
              ). Nobody owned them, so nobody picked them up.
            </p>
          </CardContent>
        </Card>
      </div>

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">What this screen leaves out, on purpose</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>
            <span className="text-foreground">A raw conversion leaderboard.</span> It ranks people by how fast their queue
            moved; inside the {team.target_min}-minute bucket every specialist converts about the same. The When fast column
            is the fair comparison.
          </li>
          <li>
            <span className="text-foreground">Messages sent.</span> It rewards volume, and phone calls are not in the data.
          </li>
          <li>
            <span className="text-foreground">CSAT / NPS.</span> Not in this dataset.
          </li>
          <li>
            <span className="text-foreground">Cost to serve per doctor.</span> No time logs or phone records.
          </li>
        </ul>
      </details>
    </>
  )
}
