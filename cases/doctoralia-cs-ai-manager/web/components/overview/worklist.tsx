"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, Clock, MessageSquare, PhoneCall, Route, Undo2 } from "lucide-react"
import { RiskExplainer } from "@/components/risk-explainer"
import { SortTh } from "@/components/sort-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import {
  ACTION_LABEL,
  SIGNAL_LABEL,
  TIER_HINT,
  TIER_LABEL,
  inTier,
  isHandled,
  scopeOwners,
  worklist,
  type Action,
  type Filters,
  type Handled,
  type SortKey,
} from "@/lib/controls"
import type { OverviewData, WatchItem } from "@/lib/types"

const PAGE = 25

const SIGNAL_TONE: Record<string, string> = {
  churn_threat: "bg-destructive/10 text-destructive",
  discouraged: "bg-warning/10 text-warning",
}

const ACTION_ICON = { brief: PhoneCall, draft: MessageSquare, handoff: Route } as const
const ACTION_TONE: Record<string, string> = {
  brief: "text-destructive",
  draft: "text-foreground",
  handoff: "text-muted-foreground",
}

function Bookings({ w }: { w: WatchItem }) {
  if (w.bookings_avg == null) return <span className="text-muted-foreground">—</span>
  const below = w.median_specialty_city != null && w.bookings_avg < w.median_specialty_city
  return (
    <span className="tabular-nums">
      <span className={cn("font-medium", below ? "text-destructive" : "text-foreground")}>{w.bookings_avg.toFixed(1)}</span>
      {w.median_specialty_city != null && (
        <span className="text-xs text-muted-foreground"> / {Number(w.median_specialty_city.toFixed(1))}</span>
      )}
    </span>
  )
}

function Lead({ w }: { w: WatchItem }) {
  if (w.days_of_lead_left == null) return <span className="text-muted-foreground">no note</span>
  if (w.overdue) return <span className="text-muted-foreground">{w.days_elapsed} d since note</span>
  return (
    <span className={cn("font-medium", w.days_of_lead_left <= 1 ? "text-destructive" : "text-foreground")}>
      {w.days_of_lead_left} {w.days_of_lead_left === 1 ? "day" : "days"} left
    </span>
  )
}

export function Worklist({
  data,
  filters,
  onChange,
  handled,
  onHandle,
  onOpenDoctor,
  role,
  now,
}: {
  data: OverviewData
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  handled: Record<string, Handled>
  onHandle: (doctorId: string, h: Handled | null) => void
  onOpenDoctor: (doctorId: string, owner: string) => void
  role: "manager" | "specialist"
  now: Date
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)

  const names = useMemo(() => Object.fromEntries(data.specialists.map((s) => [s.id, s.name])), [data.specialists])
  const rows = useMemo(() => worklist(data, filters, handled, now), [data, filters, handled, now])

  // Counts inside the current portfolio, so tabs and action chips never promise rows that are not there.
  const counts = useMemo(() => {
    const owners = scopeOwners(data, filters.scope)
    const mine = data.watchlist.items.filter((w) => owners.has(w.owner_specialist_id))
    const tiers = Object.fromEntries(
      (["act_now", "at_risk", "watch", "overdue", "all"] as const).map((t) => [t, mine.filter((w) => inTier(w, t)).length]),
    )
    const inThisTier = mine.filter((w) => inTier(w, filters.tier))
    const actions = Object.fromEntries(
      (["brief", "draft", "handoff"] as const).map((a) => [a, inThisTier.filter((w) => w.action === a).length]),
    )
    return { tiers, actions, tierTotal: inThisTier.length }
  }, [data, filters.scope, filters.tier])

  const signals = useMemo(
    () => Array.from(new Set(data.watchlist.items.map((w) => w.top_signal).filter((s): s is string => !!s && s in SIGNAL_LABEL))),
    [data.watchlist.items],
  )

  const change = (patch: Partial<Filters>) => {
    setShown(PAGE)
    setExpanded(null)
    onChange(patch)
  }
  const onSort = (k: SortKey, dir: "asc" | "desc") => change({ sortKey: k, sortDir: dir })
  const today = now.toISOString().slice(0, 10)
  const inAWeek = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10)
  const cols = role === "manager" ? 9 : 8

  return (
    <Card id="worklist" className="scroll-mt-24">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{role === "specialist" ? "My day" : "Work queue"}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">
            Every doctor with a warning note or a risk of 50% or more, with what the copilot recommends: call, message or
            route. Click a column to sort it.
          </p>
        </div>

        <div role="tablist" aria-label="Which doctors" className="flex flex-wrap gap-2">
          {(["act_now", "at_risk", "watch", "overdue", "all"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              title={t === "all" ? "Everything in the queue" : TIER_HINT[t]}
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
              {t === "all" ? "All" : TIER_LABEL[t]}
              <span className="font-semibold tabular-nums text-foreground">{counts.tiers[t].toLocaleString("en-US")}</span>
            </button>
          ))}
        </div>
        {filters.tier !== "all" && <p className="-mt-2 text-xs text-muted-foreground text-pretty">{TIER_HINT[filters.tier]}.</p>}

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Action</span>
            <div role="radiogroup" aria-label="Action" className="inline-flex rounded-lg border border-input p-0.5">
              {(["all", "brief", "draft", "handoff"] as Action[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={filters.action === a}
                  onClick={() => change({ action: a })}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium tabular-nums",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filters.action === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a === "all" ? `All ${counts.tierTotal}` : `${ACTION_LABEL[a]} ${counts.actions[a]}`}
                </button>
              ))}
            </div>
          </div>

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
        <RiskExplainer risk={data.risk} />
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing here for this filter.{" "}
            {filters.tier === "act_now" && "Check At risk, Watch and Overdue before reading this as good news."}
          </p>
        ) : (
          <div className="relative w-full overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border text-left">
                <tr>
                  <SortTh label="Doctor" k="name" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} firstDir="asc" />
                  <SortTh label="Action" k="action" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} firstDir="asc" title="Call first, then message, then route" />
                  <SortTh label="Signal" k="signal" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} firstDir="asc" />
                  <SortTh label="Lead time" k="lead" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} firstDir="asc" title="Days left of the warning a note usually gives" />
                  <SortTh label="Risk" k="risk" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} align="right" />
                  <SortTh label="Bookings / mo · peers" k="bookings" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} align="right" title="Average monthly patient bookings / median for the same specialty and city. Red: below peers" />
                  <SortTh label="Last contact" k="contact" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} align="right" title="Days since the last logged contact" />
                  {role === "manager" && <SortTh label="Owner" k="owner" {...{ sortKey: filters.sortKey, dir: filters.sortDir, onSort }} firstDir="asc" />}
                  <th className="py-2 pr-3 text-right text-xs font-medium text-muted-foreground">Done</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((w) => {
                  const open = expanded === w.doctor_id
                  const h = handled[w.doctor_id]
                  const off = isHandled(h, now)
                  const Icon = w.action in ACTION_ICON ? ACTION_ICON[w.action as keyof typeof ACTION_ICON] : null
                  return (
                    <Fragment key={w.doctor_id}>
                      <tr className={cn("border-b border-border", off && "opacity-55")} aria-expanded={open}>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => onOpenDoctor(w.doctor_id, w.owner_specialist_id)}
                            className="flex flex-col items-start rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="font-medium text-primary underline-offset-4 hover:underline">{w.doctor_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {w.specialty} · {w.city}
                            </span>
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          {Icon ? (
                            <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", ACTION_TONE[w.action])}>
                              <Icon className="size-3.5" aria-hidden />
                              {ACTION_LABEL[w.action as keyof typeof ACTION_LABEL]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">nothing to do</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {w.top_signal && SIGNAL_LABEL[w.top_signal] ? (
                            <Badge variant="secondary" className={cn("font-medium", SIGNAL_TONE[w.top_signal])}>
                              {SIGNAL_LABEL[w.top_signal]}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          <Lead w={w} />
                        </td>
                        <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatPercent(w.risk_score, 0)}</td>
                        <td className="py-2 pr-3 text-right">
                          <Bookings w={w} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {w.days_since_contact == null ? "never" : `${w.days_since_contact} d`}
                        </td>
                        {role === "manager" && <td className="py-2 pr-3 text-muted-foreground">{names[w.owner_specialist_id] ?? w.owner_specialist_id}</td>}
                        <td className="py-2 pr-3 text-right">
                          {off ? (
                            <Button variant="ghost" size="sm" onClick={() => onHandle(w.doctor_id, null)}>
                              <Undo2 className="size-3.5" />
                              {h?.state === "done" ? (h.via === "whatsapp" ? "Sent" : "Done") : `To ${h?.until?.slice(5)}`}
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
                                title="Snooze 7 days"
                                onClick={() => onHandle(w.doctor_id, { state: "snoozed", at: today, until: inAWeek })}
                              >
                                <Clock className="size-3.5" />
                                7d
                              </Button>
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : w.doctor_id)}
                            aria-label={open ? "Hide note" : "Show note"}
                            className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border">
                          <td colSpan={cols + 1} className="bg-muted/40 px-3 py-2">
                            <div className="flex flex-col gap-2 text-sm">
                              {w.quote ? (
                                <p className="italic text-foreground text-pretty">&ldquo;{w.quote}&rdquo;</p>
                              ) : (
                                <p className="text-muted-foreground">No note on file. On the list because of its risk score.</p>
                              )}
                              <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                                {w.signal_at && <span>Note on {w.signal_at.slice(0, 10)}</span>}
                                {w.lead_median != null && <span>typical warning {w.lead_median} days</span>}
                                {w.onboarding_grade && <span>onboarding grade {w.onboarding_grade}</span>}
                                <Link href={`/doctor?id=${w.doctor_id}`} className="text-primary underline-offset-4 hover:underline">
                                  Full profile →
                                </Link>
                                <Link href={`/conversations?open=${w.doctor_id}`} className="text-primary underline-offset-4 hover:underline">
                                  Conversation →
                                </Link>
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
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
