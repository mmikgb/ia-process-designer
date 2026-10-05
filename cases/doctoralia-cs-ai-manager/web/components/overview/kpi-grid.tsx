"use client"

import { ArrowDown, ArrowUp } from "lucide-react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatDeltaPct, isGoodDelta, pyFormat } from "@/lib/format"
import type { CompareCell, KpiItem } from "@/lib/types"

/**
 * compare === null means "previous 30 days": each card's own prev and delta.
 * Otherwise every card is set against the chosen reference, precomputed in Python.
 */
export function KpiGrid({
  kpis,
  compare,
  refLabel,
}: {
  kpis: KpiItem[]
  compare: Record<string, CompareCell> | null
  refLabel: string
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} cell={compare ? (compare[kpi.key] ?? null) : undefined} refLabel={refLabel} />
      ))}
    </div>
  )
}

function KpiCard({ kpi, cell, refLabel }: { kpi: KpiItem; cell?: CompareCell | null; refLabel: string }) {
  // undefined: previous-period mode. null: this measure has no value for the chosen reference.
  const delta = cell === undefined ? kpi.delta_pct : (cell?.delta_pct ?? null)
  const hasDelta = delta !== null
  const isIncrease = hasDelta && delta! > 0
  const good = hasDelta && isGoodDelta(delta!, kpi.good)
  const hasSpark = kpi.spark.length > 1

  return (
    <Card className="rounded-xl border-border">
      <CardHeader className="gap-1 pb-0">
        <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
            {pyFormat(kpi.value, kpi.fmt)}
          </span>
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
              {formatDeltaPct(delta!)}
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

        {cell && (
          <p className="text-xs tabular-nums text-foreground">
            {cell.unit === "per100" ? (
              <>
                {cell.mine.toFixed(1)} per 100 doctors · {refLabel.toLowerCase()} {cell.ref.toFixed(1)}
              </>
            ) : (
              <>
                {refLabel}: {pyFormat(cell.ref, kpi.fmt)}
              </>
            )}
          </p>
        )}
        {cell === null && <p className="text-xs text-muted-foreground">No {refLabel.toLowerCase()} value for this measure</p>}
        <p className="text-xs text-muted-foreground text-pretty">{kpi.note}</p>
      </CardContent>
    </Card>
  )
}
