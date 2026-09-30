"use client"

import { ControlChart, RULE_LABEL, type Fmt } from "@/components/control/control-chart"
import type { OverviewData } from "@/lib/types"

const pct: Fmt = (v) => `${(v * 100).toFixed(0)}%`
const count: Fmt = (v) => v.toFixed(v % 1 ? 1 : 0)
const minutes: Fmt = (v) => `${v.toFixed(0)} min`
const score: Fmt = (v) => v.toFixed(1)

// Order and wording are editorial; every value, limit and flag comes from spc.py.
const CHARTS: { key: string; fmt: Fmt; reading: string }[] = [
  {
    key: "onboarding_grade_d_daily",
    fmt: pct,
    reading:
      "The share of onboardings that close at grade D. Points above the centre are the problem; runs below it are improvements, and still count as change.",
  },
  {
    key: "onboarding_score_weekly",
    fmt: score,
    reading:
      "Average onboarding score per week. A large, steady n, so this is where a real drop shows as a signal instead of an opinion.",
  },
  {
    key: "pickup_weekly",
    fmt: minutes,
    reading: "Median minutes to pick up an escalation. The conversion finding rests on this metric.",
  },
  {
    key: "escalations_daily",
    fmt: count,
    reading:
      "A count of escalations raised per day. About three a day is too few for a daily rate, so this chart judges volume only.",
  },
]

export function ControlScreen({ data }: { data: OverviewData }) {
  // The pickup finding, quoted from the measured buckets rather than typed in.
  const b = data.team.buckets
  const finding =
    b.length > 1
      ? ` Escalations answered in ${b[0].bucket} convert at ${pct(b[0].converted)}; at ${b[b.length - 1].bucket}, ${pct(b[b.length - 1].converted)}.`
      : ""
  const charts = CHARTS.map((c) => (c.key === "pickup_weekly" ? { ...c, reading: c.reading + finding } : c))
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Is this movement real, or noise?</h2>
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">
          Each chart has a centre and limits computed from a frozen baseline. A point is flagged only when it breaks one of
          three rules, and every flag says which. Everything else is the normal wobble of the process and does not need a
          meeting. These charts cover the whole portfolio: one specialist&apos;s book has too few points a day to hold
          limits.
        </p>
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries(RULE_LABEL).map(([k, label], i) => (
            <li key={k} className="rounded-lg border border-border bg-card px-3 py-2">
              <span className="font-medium text-foreground">
                Rule {i + 1} · {label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {i === 0 && "Something changed, today."}
                {i === 1 && "A shift too small for rule 1 to catch quickly."}
                {i === 2 && "A sustained shift. On weekly data this takes eight weeks to fire."}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {charts.filter((c) => data.spc[c.key]).map((c) => (
          <ControlChart key={c.key} chartKey={c.key} chart={data.spc[c.key]} fmt={c.fmt} reading={c.reading} />
        ))}
      </div>
    </>
  )
}
