"use client"

// Onboardings closed per week, activated vs struggling, as smooth stacked areas with a dark
// rounded tooltip. The KPI window is shaded so the chart and the cards agree.
import { Area, AreaChart, CartesianGrid, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts"
import { ExplainButton } from "@/components/ai/explain"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { useT } from "@/lib/i18n"
import type { WeeklyOnboarding } from "@/lib/types"

const start = (week: string) => week.split("/")[0]

function Tip({ active, payload }: { active?: boolean; payload?: { payload: WeeklyOnboarding }[] }) {
  const { t, num, pct, day } = useT()
  if (!active || !payload?.length) return null
  const w = payload[0].payload
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-foreground px-3 py-2.5 text-xs text-background shadow-lg">
      <span className="font-semibold">{t("summary.onb.week", { date: day(start(w.week)) })}</span>
      <span className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-chart-1" aria-hidden />
        {t("summary.onb.activated")}: <span className="font-semibold tabular-nums">{num(w.activated)}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-chart-2" aria-hidden />
        {t("summary.onb.struggling")}: <span className="font-semibold tabular-nums">{num(w.struggling)}</span>
      </span>
      <span className="text-background/70 tabular-nums">
        {t("summary.onb.total")} {num(w.n)} · {t("summary.onb.grade_d")} {pct(w.grade_d_rate, 1)}
      </span>
    </div>
  )
}

export function OnboardingsChart({ weekly, extractDate, windowDays }: { weekly: WeeklyOnboarding[]; extractDate: string; windowDays?: number }) {
  const { t, day } = useT()
  const config: ChartConfig = {
    activated: { label: t("summary.onb.activated"), color: "var(--color-chart-1)" },
    struggling: { label: t("summary.onb.struggling"), color: "var(--color-chart-2)" },
  }
  const cutoff = windowDays ? Date.parse(`${extractDate}T00:00:00`) - windowDays * 864e5 : null
  const inWindow = cutoff ? weekly.filter((w) => Date.parse(`${w.week.split("/")[1]}T00:00:00`) > cutoff) : []
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{t("summary.onb")}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">{t("summary.onb.sub")}</p>
        </div>
        <ExplainButton kind="spc" itemKey="onboarding_grade_d_daily" label={t("summary.onb")} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-chart-1" aria-hidden />
            {t("summary.onb.activated")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-chart-2" aria-hidden />
            {t("summary.onb.struggling")}
          </span>
        </div>
        <ChartContainer config={config} className="h-72 w-full">
          <AreaChart data={weekly} margin={{ left: 0, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="onb-a" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="onb-s" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="week" tickFormatter={(w: string) => day(start(w))} tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} className="text-xs" />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} className="text-xs" />
            {inWindow.length > 0 && (
              <ReferenceArea x1={inWindow[0].week} x2={inWindow[inWindow.length - 1].week} fill="var(--color-primary)" fillOpacity={0.06} ifOverflow="extendDomain" />
            )}
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-border)" }} />
            <Area type="monotone" dataKey="activated" stackId="1" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#onb-a)" />
            <Area type="monotone" dataKey="struggling" stackId="1" stroke="var(--color-chart-2)" strokeWidth={2} fill="url(#onb-s)" />
          </AreaChart>
        </ChartContainer>
        {windowDays ? <p className="text-xs text-muted-foreground">{t("summary.onb.window", { n: windowDays })}</p> : null}
      </CardContent>
    </Card>
  )
}
