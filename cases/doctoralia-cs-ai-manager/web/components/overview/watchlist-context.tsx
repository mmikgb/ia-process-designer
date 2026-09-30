import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SIGNAL_LABEL } from "@/lib/controls"
import { formatPercent } from "@/lib/format"
import type { Predict } from "@/lib/types"

/** Why the watchlist is ordered the way it is, and what it cannot see. Every number from forecast.py. */
export function WatchlistContext({ predict }: { predict: Predict }) {
  const { ceiling, lead_times, day14 } = predict
  const maxP75 = Math.max(...lead_times.map((l) => l.p75), 1)
  const [failed, passed] = [
    day14.evidence.find((e) => !e.calendar_on_by_day_14),
    day14.evidence.find((e) => e.calendar_on_by_day_14),
  ]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>How much warning each signal gives</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-pretty">
            Days between the note and the cancellation, among doctors who churned. &ldquo;Days left&rdquo; in the list is
            this median minus the days already gone.
          </p>
          <ul className="flex flex-col gap-3">
            {lead_times.map((l) => (
              <li key={l.signal} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{SIGNAL_LABEL[l.signal] ?? l.signal}</span>
                  <span className="tabular-nums text-foreground">
                    {l.median_days} days <span className="text-xs text-muted-foreground">median · n={l.n}</span>
                  </span>
                </div>
                {/* interquartile range as a bar, median as a tick */}
                <div className="relative h-2 rounded-full bg-muted" aria-hidden>
                  <div
                    className="absolute inset-y-0 rounded-full bg-foreground/35"
                    style={{ left: `${(l.p25 / maxP75) * 100}%`, width: `${((l.p75 - l.p25) / maxP75) * 100}%` }}
                  />
                  <div className="absolute inset-y-[-2px] w-0.5 bg-foreground" style={{ left: `${(l.median_days / maxP75) * 100}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  half of them between {l.p25} and {l.p75} days
                </span>
              </li>
            ))}
          </ul>
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground text-pretty">
            <span className="font-medium">The ceiling:</span> {ceiling.with_warning} of {ceiling.churned_total} churned
            doctors ({formatPercent(ceiling.share, 0)}) left a warning note first. This list cannot see the other{" "}
            {ceiling.churned_total - ceiling.with_warning}. An empty list is not good news.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding checkpoint, day {day14.checkpoint_day}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-pretty">
            Rule: a new doctor without the calendar turned on by day {day14.checkpoint_day} gets a call that week.
          </p>
          {failed && passed && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { e: failed, title: "Calendar off at day 14" },
                { e: passed, title: "Calendar on at day 14" },
              ].map(({ e, title }) => (
                <div key={title} className="flex flex-col gap-1 rounded-lg border border-border bg-background px-3 py-3">
                  <span className="text-xs font-medium text-muted-foreground">{title}</span>
                  <span className="text-2xl font-semibold tabular-nums text-foreground">{formatPercent(e.grade_d, 1)}</span>
                  <span className="text-xs text-muted-foreground">closed at grade D</span>
                  <span className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {e.n.toLocaleString("en-US")} onboardings · score {e.avg_score} · churn {formatPercent(e.churn, 1)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!day14.live_cohort && (
            <p className="text-sm text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">No live cohort in this extract.</span> Every onboarding closed
              on or before the extract date, so today&apos;s day-{day14.checkpoint_day} worklist is empty by construction. In
              production this is a daily list; here the rule is shown against onboardings that already finished, which is
              what proves it works.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
