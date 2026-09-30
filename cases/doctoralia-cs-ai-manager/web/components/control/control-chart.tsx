"use client"

import { AlertTriangle, CheckCircle2 } from "lucide-react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SpcChart, SpcPoint } from "@/lib/types"

export const RULE_LABEL: Record<string, string> = {
  rule1: "Beyond the 3σ limits",
  rule2: "2 of 3 beyond 2σ, same side",
  rule3: "8 in a row on one side of the centre",
}

const KIND: Record<SpcChart["chart"], string> = {
  p: "p-chart · limits move with each day's n",
  c: "c-chart · Poisson limits for a daily count",
  xmr: "XmR · one value per week",
}

export type Fmt = (v: number) => string

function shortDate(period: string) {
  return new Date(`${period.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function SpcTooltip({
  active,
  payload,
  fmt,
  center,
}: {
  active?: boolean
  payload?: { payload: SpcPoint }[]
  fmt: Fmt
  center: number
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="max-w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{shortDate(p.period)}</p>
      <p className="tabular-nums">
        {fmt(p.value)}
        {p.n != null && <span className="text-muted-foreground"> · n={p.n}</span>}
      </p>
      <p className="tabular-nums text-muted-foreground">
        limits {fmt(p.lcl)} – {fmt(p.ucl)} · centre {fmt(center)}
      </p>
      {p.signals.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 font-medium text-warning">
          {p.signals.map((s) => (
            <li key={s}>
              ▲ {RULE_LABEL[s] ?? s} ({p.value > center ? "above" : "below"} centre)
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ControlChart({ chart, fmt, reading }: { chart: SpcChart; fmt: Fmt; reading: string }) {
  const flagged = chart.points.filter((p) => p.signals.length)
  const first = chart.points[0]?.period
  const baseEnd = [...chart.points].reverse().find((p) => p.period.slice(0, 10) <= chart.baseline.to)?.period

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>{chart.label}</CardTitle>
          <span className="text-xs text-muted-foreground">{KIND[chart.chart]}</span>
        </div>
        <p className="text-sm text-muted-foreground text-pretty">{reading}</p>
        {chart.stability.stable ? (
          <p className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Stable during the baseline, so a flagged point here is worth a question.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground text-pretty">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <span className="font-medium">Not stable in the baseline</span> (
              {Math.round(chart.stability.baseline_out_of_control * 100)}% of baseline points flagged). Read the limits
              as a description, not an alarm threshold.
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              {first && baseEnd && (
                <ReferenceArea
                  x1={first}
                  x2={baseEnd}
                  fill="var(--color-muted-foreground)"
                  fillOpacity={0.07}
                  ifOverflow="extendDomain"
                  label={{ value: "frozen baseline", position: "insideTopLeft", fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
              )}
              <XAxis
                dataKey="period"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                tickFormatter={fmt}
                tickLine={false}
                axisLine={false}
                width={60}
                tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<SpcTooltip fmt={fmt} center={chart.center} />} cursor={{ stroke: "var(--color-border)" }} />
              <ReferenceLine y={chart.center} stroke="var(--color-muted-foreground)" strokeWidth={1} />
              <Line dataKey="ucl" type="stepAfter" stroke="var(--color-muted-foreground)" strokeDasharray="4 3" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
              <Line dataKey="lcl" type="stepAfter" stroke="var(--color-muted-foreground)" strokeDasharray="4 3" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
              <Line
                dataKey="value"
                type="linear"
                stroke="var(--color-chart-1)"
                strokeWidth={chart.points.length > 60 ? 1.25 : 2}
                isAnimationActive={false}
                activeDot={{ r: 4 }}
                dot={(d: { cx?: number; cy?: number; index?: number; payload?: SpcPoint }) =>
                  d.payload?.signals.length && d.cx != null && d.cy != null ? (
                    // Flagged points: amber, bigger, ringed in the surface so they separate from the line.
                    <circle key={`s${d.index}`} cx={d.cx} cy={d.cy} r={4.5} fill="var(--color-chart-2)" stroke="var(--color-card)" strokeWidth={2} />
                  ) : (
                    <g key={`d${d.index}`} />
                  )
                }
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-chart-1" /> value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-muted-foreground" /> control limits
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-muted-foreground" /> centre ({fmt(chart.center)})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-chart-2" /> signal ({flagged.length})
          </span>
          <span>
            baseline {chart.baseline.from} → {chart.baseline.to}, frozen
          </span>
        </div>

        <details className="group rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
            Show the flagged points ({flagged.length})
          </summary>
          {flagged.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted-foreground">No point fired a rule.</p>
          ) : (
            <div className="overflow-x-auto px-3 pb-3">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Date</th>
                    <th className="py-1 pr-3 font-medium">Value</th>
                    <th className="py-1 pr-3 font-medium">Limits</th>
                    <th className="py-1 font-medium">Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((p) => (
                    <tr key={p.period} className="border-t border-border">
                      <td className="py-1 pr-3">{p.period.slice(0, 10)}</td>
                      <td className="py-1 pr-3">
                        {fmt(p.value)} <span className="text-xs text-muted-foreground">{p.value > chart.center ? "above" : "below"}</span>
                      </td>
                      <td className="py-1 pr-3 text-muted-foreground">
                        {fmt(p.lcl)} – {fmt(p.ucl)}
                      </td>
                      <td className="py-1">{p.signals.map((s) => RULE_LABEL[s] ?? s).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </CardContent>
    </Card>
  )
}
