"use client"

// One control chart: the value, the frozen-baseline centre and limits, and the points a
// rule flagged, in amber only. The title is the chart's finding (spc.finding, from Python);
// every value, limit and flag comes from spc.py.
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
import { ExplainButton } from "@/components/ai/explain"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT, type Key } from "@/lib/i18n"
import type { SpcChart, SpcPoint } from "@/lib/types"

export const RULES = ["rule1", "rule2", "rule3"] as const

export type Fmt = (v: number) => string

function SpcTooltip({ active, payload, fmt, center }: { active?: boolean; payload?: { payload: SpcPoint }[]; fmt: Fmt; center: number }) {
  const { t, day } = useT()
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="flex max-w-64 flex-col gap-0.5 rounded-xl bg-foreground px-3 py-2.5 text-xs text-background shadow-lg">
      <span className="font-semibold">{day(p.period)}</span>
      <span className="tabular-nums">
        {fmt(p.value)}
        {p.n != null && <span className="text-background/70"> · n={p.n}</span>}
      </span>
      <span className="text-background/70 tabular-nums">{t("control.tip.limits", { a: fmt(p.lcl), b: fmt(p.ucl), c: fmt(center) })}</span>
      {p.signals.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 font-medium text-[#f5b94a]">
          {p.signals.map((s) => (
            <li key={s}>
              ▲ {t(`control.rule.${s}` as Key)} ({t(p.value > center ? "control.above" : "control.below")})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ControlChart({ chart, fmt, reading, chartKey }: { chart: SpcChart; fmt: Fmt; reading: string; chartKey: string }) {
  const { t, tx, pct, day } = useT()
  const flagged = chart.points.filter((p) => p.signals.length)
  const first = chart.points[0]?.period
  const baseEnd = [...chart.points].reverse().find((p) => p.period.slice(0, 10) <= chart.baseline.to)?.period
  const label = tx(chart.label)

  return (
    <Card data-chart={chartKey}>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <CardTitle className="text-base leading-snug text-pretty">{chart.finding ? tx(chart.finding) : label}</CardTitle>
          </div>
          <ExplainButton kind="spc" itemKey={chartKey} label={label} className="-mt-1 -mr-2" />
        </div>
        <p className="text-sm text-muted-foreground text-pretty">{reading}</p>
        {chart.stability.stable ? (
          <p className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {t("control.stable")}
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-chip-amber px-3 py-2 text-sm text-foreground text-pretty">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <span className="font-medium">{t("control.unstable")}</span>{" "}
              {t("control.unstable.body", { p: pct(chart.stability.baseline_out_of_control) })}
            </span>
          </p>
        )}
        <span className="text-xs text-muted-foreground">{t(`control.kind.${chart.chart}` as Key)}</span>
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
                  label={{ value: t("control.baseline"), position: "insideTopLeft", fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
              )}
              <XAxis dataKey="period" tickFormatter={(p: string) => day(p)} tickLine={false} axisLine={false} minTickGap={32} tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={60} tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} domain={["auto", "auto"]} />
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
                    // flagged points: amber only, ringed in the surface so they separate from the line
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
            <span className="h-0.5 w-4 rounded bg-chart-1" /> {t("control.legend.value")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-muted-foreground" /> {t("control.legend.limits")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-muted-foreground" /> {t("control.legend.center", { v: fmt(chart.center) })}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-chart-2" /> {t("control.legend.signal", { n: flagged.length })}
          </span>
          <span>{t("control.legend.baseline", { a: day(chart.baseline.from), b: day(chart.baseline.to) })}</span>
        </div>

        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">{t("control.flagged", { n: flagged.length })}</summary>
          {flagged.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted-foreground">{t("control.flagged.none")}</p>
          ) : (
            <div className="overflow-x-auto px-3 pb-3">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">{t("control.col.date")}</th>
                    <th className="py-1 pr-3 font-medium">{t("control.col.value")}</th>
                    <th className="py-1 pr-3 font-medium">{t("control.col.limits")}</th>
                    <th className="py-1 font-medium">{t("control.col.rule")}</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((p) => (
                    <tr key={p.period} className="border-t border-border">
                      <td className="py-1 pr-3">{day(p.period)}</td>
                      <td className="py-1 pr-3">
                        {fmt(p.value)} <span className="text-xs text-muted-foreground">{t(p.value > chart.center ? "control.above" : "control.below")}</span>
                      </td>
                      <td className="py-1 pr-3 text-muted-foreground">
                        {fmt(p.lcl)} – {fmt(p.ucl)}
                      </td>
                      <td className="py-1">{p.signals.map((s) => t(`control.rule.${s}` as Key)).join("; ")}</td>
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
