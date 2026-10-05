"use client"

// Resumen, the manager's overview (T5.3). Every number comes from a block Python
// precomputed for this scope; the browser only picks the block. The book comes from the
// context switcher; "Comparar con" picks a reference Python already compared against, and is
// remembered per browser.
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
import type { CompareRef, OverviewData } from "@/lib/types"
import { cn } from "@/lib/utils"

const COMPARE = "cs:compare"
type Compare = "prev" | CompareRef

/** The references a scope can be compared with: a specialist against their team and the book, a team against the book. */
function compareOptions(scope: string): Compare[] {
  if (scope === "all") return ["prev", "baseline"]
  if (scope.startsWith("team:")) return ["prev", "all", "baseline"]
  return ["prev", "team", "all", "baseline"]
}

export function Dashboard({ data }: { data: OverviewData }) {
  const { t, dayLong } = useT()
  const { scope: book, ready } = useIdentity()
  const period = String(data.kpi.window_days)
  const [compare, setCompare] = useState<Compare>("prev")
  useEffect(() => {
    try {
      const c = localStorage.getItem(COMPARE) as Compare | null
      if (c) setCompare(c)
    } catch {
      // blocked storage: the previous period
    }
  }, [])
  const pick = (c: Compare) => {
    setCompare(c)
    try {
      localStorage.setItem(COMPARE, c)
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
  const kpi = scope.periods[period] ?? Object.values(scope.periods)[0]
  const options = compareOptions(scopeKey)
  // a reference this scope does not have (a team has no team) falls back to the previous period
  const ref: Compare = options.includes(compare) ? compare : "prev"

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("summary.window", { n: kpi.window_days, date: dayLong(kpi.asof) })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("summary.compare")}</span>
          <div role="radiogroup" aria-label={t("summary.compare")} className="inline-flex flex-wrap rounded-lg border border-input bg-card p-0.5">
            {options.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ref === c}
                onClick={() => pick(c)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  ref === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`summary.compare.${c}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <HeroCard healthScore={kpi.health_score} healthNote={kpi.health_note} totals={kpi.totals} />

      <KpiGrid
        kpis={kpi.kpis}
        scope={scopeKey}
        period={period}
        compare={ref === "prev" ? null : (scope.compare?.[ref] ?? {})}
        refLabel={t(`summary.compare.${ref}`)}
      />

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
