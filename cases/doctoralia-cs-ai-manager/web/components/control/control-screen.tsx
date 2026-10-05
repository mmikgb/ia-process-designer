"use client"

import { AlertTriangle, CircleAlert, Database } from "lucide-react"
import { ControlChart, RULES, type Fmt } from "@/components/control/control-chart"
import { useT, type Key } from "@/lib/i18n"
import type { SpcChart, Team } from "@/lib/types"

const GROUPS = [
  { key: "onboarding", charts: ["onboarding_grade_d_daily", "onboarding_score_weekly", "onboarding_late_weekly", "onboarding_cap_weekly"] },
  { key: "escalations", charts: ["escalations_daily", "pickup_weekly", "escalation_fast_weekly", "escalation_conversion_weekly"] },
  { key: "health", charts: ["churn_threat_notes_weekly", "hollow_calendar_creation_weekly"] },
  { key: "campaign", charts: ["campaign_engagement_daily"] },
] as const

export function ControlScreen({ spc, buckets, asof }: { spc: Record<string, SpcChart>; buckets: Team["buckets"]; asof: string }) {
  const { t, tx, num, pct, day } = useT()
  const fmt: Record<string, Fmt> = {
    onboarding_grade_d_daily: (v) => pct(v),
    onboarding_score_weekly: (v) => num(v, 1),
    onboarding_late_weekly: (v) => pct(v, 1),
    onboarding_cap_weekly: (v) => pct(v),
    escalations_daily: (v) => num(v, v % 1 ? 1 : 0),
    pickup_weekly: (v) => t("control.min", { v: num(v) }),
    escalation_fast_weekly: (v) => pct(v),
    escalation_conversion_weekly: (v) => pct(v),
    churn_threat_notes_weekly: (v) => num(v, v % 1 ? 1 : 0),
    campaign_engagement_daily: (v) => pct(v),
  }
  const [a, b] = [buckets[0], buckets[buckets.length - 1]]
  const reading = (k: string) =>
    t(`control.read.${k}` as Key) +
    (k === "pickup_weekly" && a && b && a !== b
      ? ` ${t("control.pickup.finding", { a: a.bucket, pa: pct(a.converted), b: b.bucket, pb: pct(b.converted) })}`
      : "")

  const cutoff = new Date(`${asof.slice(0, 10)}T12:00:00`)
  cutoff.setDate(cutoff.getDate() - 28)
  const since = cutoff.toISOString().slice(0, 10)
  const monitored = Object.entries(spc).filter(([, chart]) => chart.available !== false)
  const baselineReview = monitored.filter(([, chart]) => chart.stability.stable === false)
  const actionable = monitored.flatMap(([key, chart]) => {
    if (chart.stability.stable !== true) return []
    const recent = chart.points.filter((point) => point.period >= since && point.signals.length)
    const latest = recent.at(-1)
    return latest ? [{ key, chart, point: latest, count: recent.length }] : []
  }).sort((x, y) => y.point.period.localeCompare(x.point.period))

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">{t("control.intro")}</p>
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold">{t("control.review.title")}</h2>
            <span className="text-xs text-muted-foreground">{t("control.review.asof", { date: day(asof) })}</span>
          </div>
          <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="px-4 py-3 sm:px-5"><strong className="text-lg tabular-nums">{monitored.length}</strong><span className="ml-2 text-sm text-muted-foreground">{t("control.review.monitored")}</span></div>
            <div className="px-4 py-3 sm:px-5"><strong className="text-lg tabular-nums">{actionable.length}</strong><span className="ml-2 text-sm text-muted-foreground">{t("control.review.actionable")}</span></div>
            <div className="px-4 py-3 sm:px-5"><strong className="text-lg tabular-nums">{baselineReview.length}</strong><span className="ml-2 text-sm text-muted-foreground">{t("control.review.baseline")}</span></div>
          </div>
          <div className="border-t border-border px-4 py-4 sm:px-5">
            {actionable.length ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm font-medium"><CircleAlert className="size-4 text-warning" aria-hidden />{t("control.review.investigate")}</p>
                <ul className="divide-y divide-border">
                  {actionable.map(({ key, chart, point, count }) => (
                    <li key={key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                      <a className="font-medium underline-offset-4 hover:underline focus-visible:underline" href={`#control-${key}`}>{tx(chart.label)}</a>
                      <span className="tabular-nums text-muted-foreground">{fmt[key](point.value)} · {day(point.period)} · {t("control.review.periods", { n: count })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("control.review.none")}</p>}
            {baselineReview.length > 0 && (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{t("control.review.baseline.note")}</p>
            )}
          </div>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.key} className="flex flex-col gap-4" aria-labelledby={`control-group-${group.key}`}>
          <div className="border-b border-border pb-2">
            <h2 id={`control-group-${group.key}`} className="text-lg font-semibold">{t(`control.group.${group.key}` as Key)}</h2>
            <p className="text-sm text-muted-foreground">{t(`control.group.${group.key}.body` as Key)}</p>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {group.charts.filter((key) => spc[key]).map((key) => {
              const chart = spc[key]
              if (chart.available === false) return (
                <div id={`control-${key}`} key={key} className="rounded-xl border border-border bg-card px-5 py-5">
                  <div className="flex items-start gap-3"><Database className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="flex flex-col gap-2">
                      <h3 className="font-semibold">{tx(chart.label)}</h3>
                      <p className="text-sm text-muted-foreground">{tx(chart.data_note)}</p>
                      {chart.snapshot && <p className="text-sm tabular-nums">{t("control.snapshot", { n: chart.snapshot.hollow, total: chart.snapshot.n, rate: pct(chart.snapshot.hollow / chart.snapshot.n) })}</p>}
                      <span className="text-xs font-medium text-muted-foreground">{t("control.unavailable")}</span>
                    </div>
                  </div>
                </div>
              )
              return <div id={`control-${key}`} key={key}><ControlChart chartKey={key} chart={chart} fmt={fmt[key]} reading={reading(key)} /></div>
            })}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <h2 className="text-base font-semibold">{t("control.rules.title")}</h2>
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          {RULES.map((rule, i) => <li key={rule} className="rounded-xl border border-border bg-card px-4 py-3">
            <span className="font-medium">{t("control.rule", { n: i + 1 })} · {t(`control.rule.${rule}` as Key)}</span>
            <span className="block text-xs text-muted-foreground">{t(`control.rule.${rule}.why` as Key)}</span>
          </li>)}
        </ol>
      </section>
    </div>
  )
}
