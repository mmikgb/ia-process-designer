"use client"

// Mi equipo (T5.4): the team as a list of people with their book, every count a link to
// exactly those doctors; then the follow-through from the outcome log (outcomes today and
// this week, follow-ups overdue, drafts sent as written vs edited); then escalation pickup.
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ExplainButton } from "@/components/ai/explain"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClock } from "@/lib/clock"
import { addDays } from "@/lib/dates"
import { useT, type Key } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { TEAM_FLAG, listHref } from "@/lib/lists"
import { loadSearch } from "@/lib/search"
import type { Rules, SearchRow, Team, TeamRow } from "@/lib/types"
import { useAllWork } from "@/lib/use-work"
import { cn } from "@/lib/utils"
import { followThrough, type FollowThrough } from "@/lib/work"

const initials = (name: string) =>
  name
    .split(" ")
    .filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")

/** Same y-axis for every specialist, so the outlier is visible without reading numbers. */
function PickupStrip({ values, max, target }: { values: (number | null)[]; max: number; target: number }) {
  const W = 120
  const H = 28
  const x = (i: number) => (i * (W - 4)) / Math.max(values.length - 1, 1) + 2
  const y = (v: number) => H - 2 - (Math.min(v, max) / max) * (H - 4)
  const segs: string[] = []
  let cur = ""
  values.forEach((v, i) => {
    if (v == null) {
      if (cur) segs.push(cur)
      cur = ""
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`
  })
  if (cur) segs.push(cur)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[120px]" aria-hidden>
      <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="var(--color-muted-foreground)" strokeDasharray="2 2" strokeWidth={0.75} />
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--color-chart-1)" strokeWidth={1.5} />
      ))}
    </svg>
  )
}

export function TeamScreen({ team, teams, rules }: { team: Team; teams: string[]; rules: Rules }) {
  const { t, num, pct } = useT()
  const { scope } = useIdentity()
  const clock = useClock()
  const [which, setWhich] = useState<string>("all")
  // The scope arrives after the first paint; it sets the team only until the person picks one,
  // so a click in that first moment is not undone when the identity loads.
  const picked = useRef(false)
  const pick = (x: string) => {
    picked.current = true
    setWhich(x)
  }
  useEffect(() => {
    if (!picked.current && scope.startsWith("team:")) setWhich(scope.slice(5))
  }, [scope])
  const rows = useMemo(() => team.rows.filter((r) => which === "all" || r.team === which), [team.rows, which])
  const minN = rules.min_n_rate ?? 10

  // the follow-through: the log, plus the notes' own follow-ups (search.json)
  const work = useAllWork()
  const [search, setSearch] = useState<SearchRow[] | null>(null)
  useEffect(() => {
    loadSearch()
      .then(setSearch)
      .catch(() => setSearch([]))
  }, [])
  const ft = useMemo(() => {
    const out = new Map<string, FollowThrough>()
    if (!work.loaded || !search) return out
    for (const r of team.rows) {
      const notes = new Map(
        search.filter((d) => d.owner === r.id && d.status === "active" && d.followup != null).map((d) => [d.id, addDays(clock.asof, d.followup!)]),
      )
      out.set(r.id, followThrough(work.events.filter((e) => e.owner === r.id), notes, clock.today, rules.followup_stale_days ?? 14))
    }
    return out
  }, [work, search, team.rows, clock.asof, clock.today, rules.followup_stale_days])

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
  const fast = team.buckets[0]
  const slow = team.buckets[team.buckets.length - 1]
  const rate = (v: number | null) => (v == null ? "—" : pct(v))

  const Count = ({ r, k }: { r: TeamRow; k: keyof typeof TEAM_FLAG & keyof TeamRow }) => {
    const v = r[k] as number
    return (
      <Link
        href={listHref(r.id, { flag: TEAM_FLAG[k] })}
        data-count={`${r.id}:${k}`}
        aria-label={`${t(`team.col.${k === "open_commitments" ? "commitments" : k}` as Key)}: ${v}, ${r.name}`}
        className="rounded px-1 font-medium text-primary tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {num(v)}
      </Link>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        {fast && slow && (
          <p className="max-w-3xl text-lg font-medium text-foreground text-pretty">
            {t("team.finding", { min: team.target_min, fast: pct(fast.converted), slow: pct(slow.converted) })}
          </p>
        )}
        <div role="radiogroup" aria-label={t("team.all")} className="inline-flex w-fit flex-wrap rounded-lg border border-input bg-card p-0.5">
          {["all", ...teams].map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={which === x}
              onClick={() => pick(x)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                which === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {x === "all" ? t("team.all") : x.replace("Farming ", "")}
            </button>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>{t("team.list")}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">{t("team.list.sub")}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t("team.col.who")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.col.book")}</th>
                <th className="py-2 pr-3 font-medium">{t("team.col.at_risk")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.col.may_cancel")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.col.hollow")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.col.not_found")}</th>
                <th className="py-2 text-right font-medium">{t("team.col.commitments")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip-green text-xs font-semibold text-chip-green-fg">
                        {initials(r.name)}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          {r.name}
                          <ExplainButton kind="team_row" itemKey={r.id} label={r.name} />
                        </span>
                        <span className="text-xs text-muted-foreground">{r.team}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-foreground tabular-nums">{num(r.portfolio)}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <Count r={r} k="at_risk" />
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-risk-critical" style={{ width: `${((r.at_risk_share ?? 0) / maxShare) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{rate(r.at_risk_share)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <Count r={r} k="may_cancel" />
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <Count r={r} k="hollow" />
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <Count r={r} k="not_found" />
                  </td>
                  <td className="py-2.5 text-right">
                    <Count r={r} k="open_commitments" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-3 text-xs text-muted-foreground text-pretty">{t("team.legend", { slots: rules.calendar_healthy_slots })}</p>
        </CardContent>
      </Card>

      <Card data-testid="follow-through">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>{t("team.ft")}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">{t("team.ft.sub")}</p>
          {work.local && <p className="text-xs text-warning">{t("team.ft.local")}</p>}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t("team.col.who")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.ft.today")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.ft.week")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("team.ft.overdue")}</th>
                <th className="py-2 text-right font-medium">{t("team.ft.drafts")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const f = ft.get(r.id)
                const dash = <span className="text-muted-foreground">…</span>
                return (
                  <tr key={r.id} data-ft={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.name.split(" ").slice(0, 2).join(" ")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f ? num(f.today) : dash}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f ? num(f.week) : dash}</td>
                    <td className={cn("py-2 pr-3 text-right tabular-nums", f && f.overdue > 0 && "font-medium text-warning")}>{f ? num(f.overdue) : dash}</td>
                    <td className="py-2 text-right tabular-nums">
                      {!f
                        ? dash
                        : f.sent === 0
                          ? t("team.ft.drafts.none")
                          : f.sent < minN
                            ? t("team.ft.drafts.count", { k: f.unedited, n: f.sent })
                            : t("team.ft.drafts.pct", { p: pct(f.unedited / f.sent), n: f.sent })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="pt-3 text-xs text-muted-foreground text-pretty">{t("team.ft.note", { n: minN })}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-1">
            <CardTitle>{t("team.pickup")}</CardTitle>
            <p className="text-sm text-muted-foreground text-pretty">{t("team.pickup.sub", { n: team.min_escalations })}</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("team.col.who")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("team.col.escalations")}</th>
                  <th className="py-2 pr-3 font-medium">{t("team.col.median")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("team.col.inside", { min: team.target_min })}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("team.col.converted")}</th>
                  <th className="py-2 text-right font-medium">{t("team.col.fast")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.name.split(" ").slice(0, 2).join(" ")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{num(r.escalations)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {r.escalations >= team.min_escalations ? (
                          <PickupStrip values={r.pickup_weeks} max={maxPickup} target={team.target_min} />
                        ) : (
                          <span className="w-[120px] text-xs text-muted-foreground">{t("team.pickup.few")}</span>
                        )}
                        <span className="text-foreground tabular-nums">{r.median_pickup == null ? "—" : t("team.min", { n: num(r.median_pickup) })}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{rate(r.within_target)}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">{rate(r.converted)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {r.escalations < team.min_escalations ? `n=${r.escalations}` : rate(r.converted_when_fast)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-3 text-xs text-muted-foreground">{t("team.pickup.line", { min: team.target_min, cap: team.target_min * 4 })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("team.buckets")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {team.buckets.map((b) => (
              <div key={b.bucket} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground">{b.bucket}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {pct(b.converted)} <span className="text-xs font-normal text-muted-foreground">n={num(b.n)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${(b.converted / maxBucket) * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground text-pretty">
              {t("team.unowned", {
                n: team.unowned.n,
                detail: Object.entries(team.unowned.by_queue)
                  .map(([k, v]) => `${t(`team.queue.${k}` as Key)} ${v}`)
                  .join(", "),
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">{t("team.out")}</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          {([1, 2, 3, 4] as const).map((i) => (
            <li key={i}>
              <span className="text-foreground">{t(`team.out.${i}` as Key)}</span> {t(`team.out.${i}.body` as Key, { min: team.target_min })}
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
