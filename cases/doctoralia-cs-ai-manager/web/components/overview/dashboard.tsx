"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AttentionList } from "@/components/overview/attention-list"
import { FilterBar } from "@/components/overview/filter-bar"
import { HeroCard } from "@/components/overview/hero-card"
import { KpiGrid } from "@/components/overview/kpi-grid"
import { OnboardingsChart } from "@/components/overview/onboardings-chart"
import { RiskSegments } from "@/components/overview/risk-segments"
import { WatchlistContext } from "@/components/overview/watchlist-context"
import { Worklist } from "@/components/overview/worklist"
import {
  defaultFilters,
  loadFilters,
  loadHandled,
  saveFilters,
  saveHandled,
  scopeLabel,
  type Filters,
  type Handled,
} from "@/lib/controls"
import type { OverviewData } from "@/lib/types"

/**
 * The screen's state lives here. Every number comes from a block Python
 * precomputed for this portfolio and period; the browser only chooses which
 * block to show and filters watchlist rows.
 */
export function Dashboard({ data }: { data: OverviewData }) {
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(data))
  const [handled, setHandled] = useState<Record<string, Handled>>({})
  // Fixed per page load so a snooze does not expire mid-render.
  const [now] = useState(() => new Date())

  useEffect(() => {
    setHandled(loadHandled())
    const saved = loadFilters(data)
    if (saved) setFilters(saved)
  }, [data])

  const onChange = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => {
      const next = { ...f, ...patch }
      saveFilters(next)
      return next
    })
  }, [])

  const onHandle = useCallback((id: string, h: Handled | null) => {
    setHandled((prev) => {
      const next = { ...prev }
      if (h) next[id] = h
      else delete next[id]
      saveHandled(next)
      return next
    })
  }, [])

  const scope = data.scopes[filters.scope] ?? data.scopes.all
  const kpi = scope.periods[filters.period] ?? scope.periods[String(data.kpi.window_days)]
  const label = useMemo(() => scopeLabel(data, filters.scope), [data, filters.scope])

  const openSignal = (signal: string) => {
    onChange({ signal, tier: "all" })
    document.getElementById("worklist")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <>
      <FilterBar data={data} filters={filters} onChange={onChange} />

      <p className="-mt-4 text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{label}</span> · last {kpi.window_days} days against
        the {kpi.window_days} before · data as of {kpi.asof}
      </p>

      <HeroCard healthScore={kpi.health_score} healthNote={kpi.health_note} totals={kpi.totals} />

      <KpiGrid kpis={kpi.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttentionList attention={kpi.attention} onOpenSignal={openSignal} />
        <RiskSegments segments={kpi.segments} />
      </div>

      <OnboardingsChart
        weekly={scope.weekly_onboardings}
        extractDate={data.meta.extract_date}
        windowDays={kpi.window_days}
      />

      <Worklist
        data={data}
        filters={filters}
        onChange={onChange}
        handled={handled}
        onHandle={onHandle}
        now={now}
      />

      <WatchlistContext predict={data.predict} />
    </>
  )
}
