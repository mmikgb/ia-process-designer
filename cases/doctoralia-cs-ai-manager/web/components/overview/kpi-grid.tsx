"use client"

import Link from "next/link"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatDeltaPct, isGoodDelta, pyFormat } from "@/lib/format"
import type { KpiItem } from "@/lib/types"
import { useT } from "@/lib/i18n"
import { ExplainButton } from "@/components/ai/explain"
import { KPI_FLAG, listHref } from "@/lib/lists"

export function KpiGrid({ kpis, scope = "all", period = "30" }: { kpis: KpiItem[]; scope?: string; period?: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} scope={scope} period={period} />
      ))}
    </div>
  )
}

function KpiCard({ kpi, scope, period }: { kpi: KpiItem; scope: string; period: string }) {
  const { tx } = useT()
  const hasDelta = kpi.delta_pct !== null
  const isIncrease = hasDelta && kpi.delta_pct! > 0
  const good = hasDelta && isGoodDelta(kpi.delta_pct!, kpi.good)
  const hasSpark = kpi.spark.length > 1

  return (
    <Card className="rounded-xl border-border">
      <CardHeader className="flex items-start justify-between gap-1 pb-0">
        <span className="text-xs font-medium text-muted-foreground">{tx(kpi.label)}</span>
        <ExplainButton kind="kpi" itemKey={kpi.key} scope={scope} period={period} label={tx(kpi.label)} className="-mt-1.5 -mr-2" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          {kpi.value != null && KPI_FLAG[kpi.key] ? (
            // a count of doctors: it opens exactly those doctors (T5.2)
            <Link
              href={listHref(scope, { flag: KPI_FLAG[kpi.key] })}
              data-count={`kpi:${kpi.key}`}
              className="rounded font-mono text-3xl font-semibold tabular-nums text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {pyFormat(kpi.value, kpi.fmt)}
            </Link>
          ) : (
            <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
              {kpi.value == null ? "\u2014" : pyFormat(kpi.value, kpi.fmt)}
            </span>
          )}
          {hasDelta && (
            <Badge
              variant="secondary"
              className={cn(
                "gap-0.5 bg-transparent",
                good ? "text-success" : "text-destructive"
              )}
            >
              {isIncrease ? (
                <ArrowUp data-icon="inline-start" className="size-3" />
              ) : (
                <ArrowDown data-icon="inline-start" className="size-3" />
              )}
              {formatDeltaPct(kpi.delta_pct!)}
            </Badge>
          )}
        </div>

        {hasSpark && (
          // Neutral line: the direction is shown, the judgement is only in the end dot,
          // which follows the same good/bad rule as the delta badge.
          <div className="h-10 w-full" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kpi.spark.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  dot={(p: { cx?: number; cy?: number; index?: number }) =>
                    p.index === kpi.spark.length - 1 && p.cx != null && p.cy != null ? (
                      <circle
                        key="last"
                        cx={p.cx}
                        cy={p.cy}
                        r={3}
                        fill={
                          !hasDelta
                            ? "var(--color-muted-foreground)"
                            : good
                              ? "var(--color-success)"
                              : "var(--color-destructive)"
                        }
                      />
                    ) : (
                      <g key={`d${p.index}`} />
                    )
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-pretty">{tx(kpi.suppressed ?? kpi.note)}</p>
      </CardContent>
    </Card>
  )
}
