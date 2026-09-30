"use client"

// Resumen, the manager's overview (T5.3). Every number comes from a block Python
// precomputed for this scope and period; the browser only picks the block. The book comes
// from the context switcher; the period is remembered per browser.
import { useEffect, useState } from "react"
import { AttentionList } from "@/components/overview/attention-list"
import { HeroCard } from "@/components/overview/hero-card"
import { KpiGrid } from "@/components/overview/kpi-grid"
import { OnboardingsChart } from "@/components/overview/onboardings-chart"
import { RiskSegments } from "@/components/overview/risk-segments"
import { WatchlistContext } from "@/components/overview/watchlist-context"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import type { OverviewData } from "@/lib/types"
import { cn } from "@/lib/utils"

const PERIOD = "cs:period"

export function Dashboard({ data }: { data: OverviewData }) {
  const { t, dayLong } = useT()
  const { scope: book, ready } = useIdentity()
  const periods = data.periods.map(String)
  const [period, setPeriod] = useState(String(data.kpi.window_days))
  useEffect(() => {
    try {
      const p = localStorage.getItem(PERIOD)
      if (p && periods.includes(p)) setPeriod(p)
    } catch {
      // blocked storage: the default period
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pick = (p: string) => {
    setPeriod(p)
    try {
      localStorage.setItem(PERIOD, p)
    } catch {
      // the choice holds for this page
    }
  }

  // until the identity is read, the scope is not known: showing "all" first would flash
  // another book's numbers (and a click in that moment would open the wrong list)
  if (!ready)
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    )

  const scopeKey = data.scopes[book] ? book : "all"
  const scope = data.scopes[scopeKey]
  const kpi = scope.periods[period] ?? scope.periods[String(data.kpi.window_days)]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("summary.window", { n: kpi.window_days, date: dayLong(kpi.asof) })}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("summary.period")}</span>
          <div role="radiogroup" aria-label={t("summary.period")} className="inline-flex rounded-lg border border-input bg-card p-0.5">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => pick(p)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("summary.period.days", { n: p })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <HeroCard healthScore={kpi.health_score} healthNote={kpi.health_note} totals={kpi.totals} />

      <KpiGrid kpis={kpi.kpis} scope={scopeKey} period={period} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AttentionList attention={kpi.attention} scope={scopeKey} />
        </div>
        <div className="lg:col-span-2">
          <RiskSegments segments={kpi.segments} scope={scopeKey} />
        </div>
      </div>

      <OnboardingsChart weekly={scope.weekly_onboardings} extractDate={data.meta.extract_date} windowDays={kpi.window_days} />

      <WatchlistContext predict={data.predict} />
    </>
  )
}
