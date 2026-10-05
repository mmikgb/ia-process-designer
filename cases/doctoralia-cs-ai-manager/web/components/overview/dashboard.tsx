"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DoctorPanel } from "@/components/doctor/doctor-panel"
import { AttentionList } from "@/components/overview/attention-list"
import { FilterBar } from "@/components/overview/filter-bar"
import { HeroCard } from "@/components/overview/hero-card"
import { KpiGrid } from "@/components/overview/kpi-grid"
import { OnboardingsChart } from "@/components/overview/onboardings-chart"
import { RiskSegments } from "@/components/overview/risk-segments"
import { WatchlistContext } from "@/components/overview/watchlist-context"
import { Worklist } from "@/components/overview/worklist"
import {
  COMPARE_LABEL,
  compareOptions,
  defaultFilters,
  loadFilters,
  loadHandled,
  saveFilters,
  saveHandled,
  scopeLabel,
  type Filters,
  type Handled,
} from "@/lib/controls"
import { useSession } from "@/lib/session"
import type { OverviewData } from "@/lib/types"

/**
 * The screen's state lives here. Every number comes from a block Python
 * precomputed for this portfolio; the browser only chooses which block to show
 * and filters and sorts queue rows.
 */
export function Dashboard({ data }: { data: OverviewData }) {
  const [session] = useSession()
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(data))
  const [handled, setHandled] = useState<Record<string, Handled>>({})
  // Fixed per page load so a snooze does not expire mid-render.
  const [now] = useState(() => new Date())

  useEffect(() => {
    setHandled(loadHandled())
    const saved = loadFilters(data)
    if (saved) setFilters(saved)
  }, [data])

  // A specialist sees their own book and nothing else. Switching back to manager
  // returns to the whole portfolio rather than leaving the manager inside one book.
  const prevRole = useRef(session.role)
  useEffect(() => {
    const was = prevRole.current
    prevRole.current = session.role
    setFilters((f) => {
      if (session.role === "specialist" && session.me && f.scope !== session.me) {
        return { ...f, scope: session.me, compare: compareOptions(session.me).includes(f.compare) ? f.compare : "prev" }
      }
      if (session.role === "manager" && was === "specialist") {
        return { ...f, scope: "all", compare: "prev" }
      }
      return f
    })
  }, [session])

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

  const [openDoc, setOpenDoc] = useState<{ id: string; owner: string } | null>(null)
  const closeDoc = useCallback(() => setOpenDoc(null), [])
  const ownerName = useCallback((id: string) => data.specialists.find((s) => s.id === id)?.name ?? id, [data.specialists])

  const scope = data.scopes[filters.scope] ?? data.scopes.all
  const kpi = scope.periods[filters.period] ?? scope.periods[String(data.kpi.window_days)]
  const label = useMemo(() => scopeLabel(data, filters.scope), [data, filters.scope])
  const compare = filters.compare === "prev" ? null : (scope.compare[filters.compare] ?? {})
  const refLabel = COMPARE_LABEL[filters.compare]

  const openSignal = (signal: string) => {
    onChange({ signal, tier: "all" })
    document.getElementById("worklist")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const worklist = (
    <Worklist
      data={data}
      filters={filters}
      onChange={onChange}
      handled={handled}
      onHandle={onHandle}
      onOpenDoctor={(id, owner) => setOpenDoc({ id, owner })}
      role={session.role}
      now={now}
    />
  )
  const specialist = session.role === "specialist"

  return (
    <>
      <FilterBar data={data} filters={filters} onChange={onChange} role={session.role} />

      <p className="-mt-4 text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{label}</span> · last {kpi.window_days} days
        {filters.compare === "prev"
          ? ` against the ${kpi.window_days} before`
          : ` against ${refLabel.toLowerCase()}`}{" "}
        · data as of {kpi.asof}
      </p>

      {!specialist && <HeroCard healthScore={kpi.health_score} healthNote={kpi.health_note} totals={kpi.totals} />}

      <KpiGrid kpis={kpi.kpis} compare={compare} refLabel={refLabel} />

      {/* A specialist's day starts with the people to contact; a manager's with the shape of the book. */}
      {specialist && worklist}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AttentionList attention={kpi.attention} onOpenSignal={openSignal} />
        <RiskSegments segments={kpi.segments} />
      </div>

      {!specialist && (
        <OnboardingsChart weekly={scope.weekly_onboardings} extractDate={data.meta.extract_date} windowDays={kpi.window_days} />
      )}

      {!specialist && worklist}

      <DoctorPanel
        target={openDoc}
        ownerName={ownerName}
        risk={data.risk}
        handled={openDoc ? handled[openDoc.id] : undefined}
        onHandle={(h) => openDoc && onHandle(openDoc.id, h)}
        onClose={closeDoc}
      />

      <WatchlistContext predict={data.predict} />
    </>
  )
}
