"use client"

import { Fragment, useMemo, useState } from "react"
import { Check, ChevronDown, Clock, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import {
  SIGNAL_LABEL,
  TIER_LABEL,
  isHandled,
  scopeOwners,
  worklist,
  type Filters,
  type Handled,
  type SortKey,
  type Tier,
} from "@/lib/controls"
import type { OverviewData } from "@/lib/types"

const PAGE = 25

const SIGNAL_TONE: Record<string, string> = {
  churn_threat: "bg-destructive/10 text-destructive",
  discouraged: "bg-warning/10 text-warning",
}

export function Worklist({
  data,
  filters,
  onChange,
  handled,
  onHandle,
  onOpenDoctor,
  now,
}: {
  data: OverviewData
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  handled: Record<string, Handled>
  onHandle: (doctorId: string, h: Handled | null) => void
  onOpenDoctor: (doctorId: string, owner: string) => void
  now: Date
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)

  const names = useMemo(
    () => Object.fromEntries(data.specialists.map((s) => [s.id, s.name])),
    [data.specialists],
  )
  const rows = useMemo(() => worklist(data, filters, handled, now), [data, filters, handled, now])

  // Counts per tier inside the current portfolio, so the tabs never promise rows that are not there.
  const tierCounts = useMemo(() => {
    const owners = scopeOwners(data, filters.scope)
    const c: Record<string, number> = { act_now: 0, watch: 0, overdue: 0 }
    for (const w of data.watchlist.items) if (owners.has(w.owner_specialist_id)) c[w.tier] += 1
    return c
  }, [data, filters.scope])

  const signals = useMemo(
    () => Array.from(new Set(data.watchlist.items.map((w) => w.top_signal))),
    [data.watchlist.items],
  )

  const change = (patch: Partial<Filters>) => {
    setShown(PAGE)
    setExpanded(null)
    onChange(patch)
  }
  const today = now.toISOString().slice(0, 10)
  const inAWeek = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10)

  return (
    <Card id="worklist" className="scroll-mt-24">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{filters.role === "specialist" ? "My day" : "Watchlist"}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">
            Doctors with a live warning, sorted by who you lose first if nothing happens.
          </p>
        </div>

        <div role="tablist" aria-label="Tier" className="flex flex-wrap gap-2">
          {(["act_now", "watch", "overdue"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={filters.tier === t}
              onClick={() => change({ tier: t })}
              className={cn(
                "flex items-baseline gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filters.tier === t
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {TIER_LABEL[t]}
              <span className="tabular-nums font-semibold text-foreground">{tierCounts[t].toLocaleString("en-US")}</span>
            </button>
          ))}
        </div>
        {filters.tier === "overdue" && (
          <p className="text-xs text-muted-foreground text-pretty">
            Past their typical lead time. Kept visible on purpose: an empty list here would read as good news.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Signal</span>
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filters.signal}
              onChange={(e) => change({ signal: e.target.value })}
            >
              <option value="all">All signals</option>
              {signals.map((s) => (
                <option key={s} value={s}>
                  {SIGNAL_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Sort by</span>
            <div role="radiogroup" aria-label="Sort by" className="inline-flex rounded-lg border border-input p-0.5">
              {(
                [
                  ["lead", "Lead time left"],
                  ["risk", "Risk"],
                ] as [SortKey, string][]
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={filters.sort === v}
                  onClick={() => change({ sort: v })}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filters.sort === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={filters.showHandled}
              onChange={(e) => change({ showHandled: e.target.checked })}
            />
            Show done and snoozed
          </label>

          <span className="ml-auto text-sm tabular-nums text-muted-foreground">
            {rows.length.toLocaleString("en-US")} {rows.length === 1 ? "doctor" : "doctors"}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing here for this filter. {filters.tier === "act_now" && "Check Watch and Overdue before reading this as good news."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Lead time</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                {filters.role === "manager" && <TableHead>Owner</TableHead>}
                <TableHead className="text-right">Action</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, shown).map((w) => {
                const open = expanded === w.doctor_id
                const h = handled[w.doctor_id]
                const off = isHandled(h, now)
                const toggle = () => setExpanded(open ? null : w.doctor_id)
                return (
                  <Fragment key={w.doctor_id}>
                    <TableRow className={cn(off && "opacity-55")} aria-expanded={open}>
                      <TableCell>
                        <button type="button" onClick={() => onOpenDoctor(w.doctor_id, w.owner_specialist_id)} className="flex flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                          <span className="font-medium text-primary underline-offset-4 hover:underline">{w.doctor_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {w.specialty} · {w.city}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("font-medium", SIGNAL_TONE[w.top_signal])}>
                          {SIGNAL_LABEL[w.top_signal] ?? w.top_signal}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {w.overdue ? (
                          <span className="text-muted-foreground">{w.days_elapsed} days since signal</span>
                        ) : (
                          <span className={cn("font-medium", w.days_of_lead_left <= 1 ? "text-destructive" : "text-foreground")}>
                            {w.days_of_lead_left} {w.days_of_lead_left === 1 ? "day" : "days"} left
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatPercent(w.risk_score, 0)}</TableCell>
                      {filters.role === "manager" && (
                        <TableCell className="text-muted-foreground">{names[w.owner_specialist_id] ?? w.owner_specialist_id}</TableCell>
                      )}
                      <TableCell className="text-right">
                        {off ? (
                          <Button variant="ghost" size="sm" onClick={() => onHandle(w.doctor_id, null)}>
                            <Undo2 className="size-3.5" />
                            {h?.state === "done" ? "Done" : `Snoozed to ${h?.until?.slice(5)}`}
                          </Button>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => onHandle(w.doctor_id, { state: "done", at: today })}>
                              <Check className="size-3.5" />
                              Done
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onHandle(w.doctor_id, { state: "snoozed", at: today, until: inAWeek })}
                            >
                              <Clock className="size-3.5" />
                              7d
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={toggle} aria-label={open ? "Hide note" : "Show note"} className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                        </button>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={filters.role === "manager" ? 7 : 6} className="whitespace-normal bg-muted/40">
                          <div className="flex flex-col gap-2 py-1 text-sm">
                            <p className="italic text-foreground text-pretty">&ldquo;{w.quote}&rdquo;</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              Signal on {w.signal_at} · typical lead time {w.lead_median} days
                              {w.bookings_avg != null && w.median_specialty_city != null &&
                                ` · ${w.bookings_avg} bookings/month vs ${w.median_specialty_city} peer median`}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
        {rows.length > shown && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more of {(rows.length - shown).toLocaleString("en-US")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
