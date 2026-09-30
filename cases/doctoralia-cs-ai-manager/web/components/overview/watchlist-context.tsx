"use client"

// Why the day's calls are ordered the way they are, and what the list cannot see. Every
// number from forecast.py.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT, type Key } from "@/lib/i18n"
import type { Predict } from "@/lib/types"

export function WatchlistContext({ predict }: { predict: Predict }) {
  const { t, num, pct } = useT()
  const { ceiling, lead_times, day14 } = predict
  const maxP75 = Math.max(...lead_times.map((l) => l.p75), 1)
  const failed = day14.evidence.find((e) => !e.calendar_on_by_day_14)
  const passed = day14.evidence.find((e) => e.calendar_on_by_day_14)
  const d = day14.checkpoint_day

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>{t("summary.lead")}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">{t("summary.lead.sub")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {lead_times.map((l) => (
              <li key={l.signal} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{t(`lead.${l.signal}` as Key)}</span>
                  <span className="text-foreground tabular-nums">
                    {t("summary.lead.median", { n: l.median_days })}{" "}
                    <span className="text-xs text-muted-foreground">{t("summary.lead.median.note", { n: l.n })}</span>
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-muted" aria-hidden>
                  <div
                    className="absolute inset-y-0 rounded-full bg-primary/35"
                    style={{ left: `${(l.p25 / maxP75) * 100}%`, width: `${((l.p75 - l.p25) / maxP75) * 100}%` }}
                  />
                  <div className="absolute -inset-y-0.5 w-0.5 rounded bg-primary" style={{ left: `${(l.median_days / maxP75) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{t("summary.lead.iqr", { a: l.p25, b: l.p75 })}</span>
              </li>
            ))}
          </ul>
          <p className="rounded-lg bg-chip-amber px-3 py-2 text-sm text-foreground text-pretty">
            <span className="font-medium">{t("summary.ceiling")}</span>{" "}
            {t("summary.ceiling.body", {
              w: num(ceiling.with_warning),
              t: num(ceiling.churned_total),
              p: pct(ceiling.share),
              rest: num(ceiling.churned_total - ceiling.with_warning),
            })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>{t("summary.day14", { d })}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">{t("summary.day14.rule", { d })}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {failed && passed && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { e: failed, title: t("summary.day14.off", { d }), tone: "text-chip-red-fg" },
                { e: passed, title: t("summary.day14.on", { d }), tone: "text-chip-green-fg" },
              ].map(({ e, title, tone }) => (
                <div key={title} className="flex flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground">{title}</span>
                  <span className={`text-2xl font-semibold tabular-nums ${tone}`}>{pct(e.grade_d, 1)}</span>
                  <span className="text-xs text-muted-foreground">{t("summary.day14.grade_d")}</span>
                  <span className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {t("summary.day14.detail", { n: num(e.n), s: num(e.avg_score, 1), c: pct(e.churn, 1) })}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!day14.live_cohort && (
            <p className="text-sm text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">{t("summary.day14.nolive")}</span> {t("summary.day14.nolive.body", { d })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
