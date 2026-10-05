"use client"

// The KPI cards: label, value, change against the previous period, the note or the reason
// a rate is withheld (n below the minimum). A count of doctors opens exactly those doctors.
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import { ExplainButton } from "@/components/ai/explain"
import { Card } from "@/components/ui/card"
import { formatDeltaPct, isGoodDelta, pyFormat } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { KPI_FLAG, listHref } from "@/lib/lists"
import type { CompareCell, KpiItem } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  kpis: KpiItem[]
  scope?: string
  period?: string
  /** null: against the previous period (the KPI's own delta); else the precomputed comparison. */
  compare?: Record<string, CompareCell> | null
  refLabel?: string
}

export function KpiGrid({ kpis, scope = "all", period = "30", compare = null, refLabel = "" }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} scope={scope} period={period} compare={compare} refLabel={refLabel} />
      ))}
    </div>
  )
}

function KpiCard({
  kpi,
  scope,
  period,
  compare,
  refLabel,
}: {
  kpi: KpiItem
  scope: string
  period: string
  compare: Record<string, CompareCell> | null
  refLabel: string
}) {
  const { t, tx } = useT()
  const hasDelta = kpi.delta_pct != null && !kpi.suppressed
  const up = hasDelta && kpi.delta_pct! > 0
  const good = hasDelta && isGoodDelta(kpi.delta_pct!, kpi.good)
  const value = kpi.value == null ? "—" : pyFormat(kpi.value, kpi.fmt)
  const flag = kpi.value != null ? KPI_FLAG[kpi.key] : undefined

  return (
    <Card className="gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{tx(kpi.label)}</span>
        <ExplainButton kind="kpi" itemKey={kpi.key} scope={scope} period={period} label={tx(kpi.label)} className="-mt-1 -mr-2" />
      </div>
      <div className="flex items-end justify-between gap-3">
        {flag ? (
          // a count of doctors: it opens exactly those doctors (T5.2)
          <Link
            href={listHref(scope, { flag })}
            data-count={`kpi:${kpi.key}`}
            title={t("summary.open_list", { n: value })}
            className="rounded text-3xl font-semibold tracking-tight text-foreground tabular-nums underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {value}
          </Link>
        ) : (
          <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{value}</span>
        )}
        {kpi.spark.length > 1 && (
          <div className="h-9 w-24" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kpi.spark.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={!hasDelta ? "var(--color-muted-foreground)" : good ? "var(--color-success)" : "var(--color-destructive)"}
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {compare ? (
        <CompareLine cell={compare[kpi.key]} kpi={kpi} refLabel={refLabel} />
      ) : hasDelta && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
              good ? "bg-chip-green text-chip-green-fg" : "bg-chip-red text-chip-red-fg",
            )}
          >
            {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
            {formatDeltaPct(kpi.delta_pct!)}
          </span>
          <span className="text-muted-foreground">{t("summary.vs")}</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground text-pretty">{tx(kpi.suppressed ?? kpi.note)}</p>
    </Card>
  )
}

/** This scope against the picked reference. Counts are shown per 100 active doctors, so a
 * 380-doctor book and the whole portfolio are on one scale. Python computed both sides. */
function CompareLine({ cell, kpi, refLabel }: { cell: CompareCell | undefined; kpi: KpiItem; refLabel: string }) {
  const { t } = useT()
  if (!cell) return <p className="text-xs text-muted-foreground">{t("summary.compare.none")}</p>
  const fmt = (v: number) => (cell.unit === "per100" ? v.toFixed(1) : pyFormat(v, kpi.fmt))
  const d = cell.delta_pct
  const good = d != null && d !== 0 && isGoodDelta(d, kpi.good)
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {d != null && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
            d === 0 ? "bg-muted text-muted-foreground" : good ? "bg-chip-green text-chip-green-fg" : "bg-chip-red text-chip-red-fg",
          )}
        >
          {d > 0 ? <ArrowUpRight className="size-3" aria-hidden /> : d < 0 ? <ArrowDownRight className="size-3" aria-hidden /> : null}
          {formatDeltaPct(d)}
        </span>
      )}
      <span className="text-muted-foreground">
        {t("summary.compare.vs", { ref: refLabel })} ·{" "}
        <span className="tabular-nums">{t("summary.compare.cell", { mine: fmt(cell.mine), ref: fmt(cell.ref) })}</span>
        {cell.unit === "per100" && ` ${t("summary.compare.per100")}`}
      </span>
    </div>
  )
}
