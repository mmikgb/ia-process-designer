"use client"

import { Bar, BarChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatPercent } from "@/lib/format"
import type { WeeklyOnboarding } from "@/lib/types"

const chartConfig: ChartConfig = {
  activated: {
    label: "Activated (A/B)",
    color: "var(--color-chart-1)",
  },
  struggling: {
    label: "Struggling (C/D)",
    color: "var(--color-chart-2)",
  },
}

function weekStartLabel(week: string) {
  const [start] = week.split("/")
  const date = new Date(`${start}T00:00:00`)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function OnboardingsTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: WeeklyOnboarding }[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const total = row.n
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">
        Week of {weekStartLabel(row.week)} · Activated {row.activated} · Struggling{" "}
        {row.struggling} · Total {total} · Grade-D {formatPercent(row.grade_d_rate, 1)}
      </p>
    </div>
  )
}

export function OnboardingsChart({
  weekly,
  extractDate,
  windowDays,
}: {
  weekly: WeeklyOnboarding[]
  extractDate: string
  windowDays?: number
}) {
  // The weeks that fall inside the KPI comparison window, shaded so the chart and the cards agree.
  const cutoff = windowDays
    ? new Date(new Date(`${extractDate}T00:00:00`).getTime() - windowDays * 864e5)
    : null
  const inWindow = cutoff ? weekly.filter((w) => new Date(`${w.week.split("/")[1]}T00:00:00`) > cutoff) : []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboardings closed per week</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ChartContainer config={chartConfig} className="h-72 w-full">
          <BarChart data={weekly} margin={{ left: 4, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="week"
              tickFormatter={weekStartLabel}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              className="text-xs"
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} className="text-xs" />
            {inWindow.length > 0 && (
              <ReferenceArea
                x1={inWindow[0].week}
                x2={inWindow[inWindow.length - 1].week}
                fill="var(--color-primary)"
                fillOpacity={0.07}
                ifOverflow="extendDomain"
              />
            )}
            <ChartTooltip content={<OnboardingsTooltip />} cursor={{ fill: "var(--color-muted)" }} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="activated" stackId="onboardings" fill="var(--color-activated)" stroke="var(--color-card)" strokeWidth={1} />
            <Bar
              dataKey="struggling"
              stackId="onboardings"
              fill="var(--color-struggling)"
              stroke="var(--color-card)"
              strokeWidth={1}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <p className="text-xs text-muted-foreground">
          {windowDays ? `Shaded: the last ${windowDays} days, the window the cards compare. ` : ""}
          Last week is partial (extract ends {extractDate}).
        </p>
      </CardContent>
    </Card>
  )
}
