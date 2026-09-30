"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { OverviewData, PulseRow } from "@/lib/types"

type Cell = { date: string; n: number | null; r7: number | null }

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Lay every row on the same calendar so the charts line up and hover in sync. Reshaping only. */
function onCalendar(rows: PulseRow[]): { dates: string[]; byRow: Record<string, Cell[]> } {
  const all = new Set<string>()
  rows.forEach((r) => r.points.forEach((p) => all.add(p.date)))
  const dates = [...all].sort()
  const byRow: Record<string, Cell[]> = {}
  for (const r of rows) {
    const m = new Map(r.points.map((p) => [p.date, p]))
    byRow[r.key] = dates.map((d) => m.get(d) ?? { date: d, n: null, r7: null })
  }
  return { dates, byRow }
}

function RowTooltip({ active, payload, rate }: { active?: boolean; payload?: { payload: Cell }[]; rate: boolean }) {
  if (!active || !payload?.length) return null
  const c = payload[0].payload
  if (c.n == null && c.r7 == null) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{day(c.date)}</p>
      {!rate && c.n != null && <p className="tabular-nums">that day: {c.n}</p>}
      {c.r7 != null && <p className="tabular-nums">7-day: {rate ? pct(c.r7) : c.r7.toFixed(1)}</p>}
    </div>
  )
}

export function PulseScreen({ data }: { data: OverviewData }) {
  const { pulse } = data
  const { dates, byRow } = useMemo(() => onCalendar(pulse.rows), [pulse.rows])
  const [range, setRange] = useState<[number, number]>([0, dates.length - 1])
  const [from, to] = [dates[range[0]], dates[range[1]]]
  const full = range[0] === 0 && range[1] === dates.length - 1
  const events = pulse.events.filter((e) => e.date >= from && e.date <= to)

  // Totals for the selected range. Summing counts already computed per day is filtering, not a new metric.
  const summary = pulse.rows
    .filter((r) => r.unit === "per day")
    .map((r) => {
      const inRange = r.points.filter((p) => p.date >= from && p.date <= to && p.n != null)
      const total = inRange.reduce((s, p) => s + (p.n ?? 0), 0)
      return { key: r.key, label: r.label, days: inRange.length, total, perDay: inRange.length ? total / inRange.length : null }
    })

  const master = byRow[pulse.rows[0].key]

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">What has been happening, day by day?</h2>
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">
          Bars are each day, quiet on purpose: daily counts have a weekday shape. The line is the seven-day average, and
          that is the read. Drag the handles under the first chart to choose a range; every chart and the table below
          follow it. Whether a movement is real is the Control screen&apos;s job.
        </p>
        <p className="max-w-3xl rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground text-pretty">
          <span className="font-medium">What cannot be daily:</span> escalations run about three a day, so they are drawn
          as a count only; a daily rate on three cases swings between 0% and 100% for no reason. Patient bookings are
          monthly in the source system — five points, not a trend line — and sit at the bottom of this page.
        </p>
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Range</CardTitle>
          <div className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-foreground">
              {day(from)} – {day(to)}
            </span>
            {!full && (
              <Button variant="outline" size="sm" onClick={() => setRange([0, dates.length - 1])}>
                Show all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={master} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[0, "auto"]} />
                <Line dataKey="r7" stroke="var(--color-chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                <Brush
                  dataKey="date"
                  height={28}
                  travellerWidth={10}
                  startIndex={range[0]}
                  endIndex={range[1]}
                  tickFormatter={day}
                  stroke="var(--color-primary)"
                  fill="var(--color-card)"
                  onChange={(r: { startIndex?: number; endIndex?: number }) =>
                    r.startIndex != null && r.endIndex != null && setRange([r.startIndex, r.endIndex])
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {pulse.rows.map((r, i) => {
          const rate = r.unit === "rate"
          const rows = byRow[r.key].slice(range[0], range[1] + 1)
          return (
            <Card key={r.key} className="gap-2 py-4">
              <CardHeader className="flex flex-row items-baseline justify-between gap-2 px-4">
                <CardTitle className="text-sm">{r.label}</CardTitle>
                <span className="text-xs text-muted-foreground">{rate ? "7-day, weighted by volume" : "bars: day · line: 7-day average"}</span>
              </CardHeader>
              <CardContent className="px-4">
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows} syncId="pulse" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={day}
                        minTickGap={48}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                        hide={i < pulse.rows.length - 1}
                      />
                      <YAxis
                        width={44}
                        tickLine={false}
                        axisLine={false}
                        domain={rate ? [0, 1] : [0, "auto"]}
                        tickFormatter={rate ? pct : undefined}
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      />
                      <Tooltip content={<RowTooltip rate={rate} />} cursor={{ stroke: "var(--color-border)" }} />
                      {events.map((e) => (
                        <ReferenceLine key={`${e.date}${e.label}`} x={e.date} stroke="var(--color-muted-foreground)" strokeDasharray="2 3" strokeWidth={1} />
                      ))}
                      {!rate && <Bar dataKey="n" fill="var(--color-muted-foreground)" fillOpacity={0.25} isAnimationActive={false} />}
                      <Line dataKey="r7" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {r.zero_pattern && (
                  <p className="pt-2 text-xs text-warning text-pretty">
                    {r.zero_days?.length} days with none recorded, {r.zero_pattern}. That looks like how the extract was
                    made, not a pause in the work; the dips in the line come from it. Check with the source before reading
                    them as a drop.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>In the selected range</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Series</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Days</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                  <th className="py-1.5 text-right font-medium">Per day</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.key} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 text-foreground">{s.label}</td>
                    <td className="py-1.5 pr-3 text-right">{s.days}</td>
                    <td className="py-1.5 pr-3 text-right">{s.total.toLocaleString("en-US")}</td>
                    <td className="py-1.5 text-right">{s.perDay == null ? "—" : s.perDay.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-2 text-xs text-muted-foreground">Each series stops at its last recorded day, not at the extract date.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events on the axis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events in this range.</p>
            ) : (
              <ol className="flex flex-col gap-1.5 text-sm">
                {events.map((e) => (
                  <li key={`${e.date}${e.label}`} className="flex gap-3">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{day(e.date)}</span>
                    <span className="text-foreground">{e.label}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="pt-1 text-xs text-muted-foreground text-pretty">
              Campaign starts come from the data. Anything else — a relaunch, a rule change, a specialist&apos;s first week
              — goes in <span className="font-mono">config/events.csv</span> and appears here on the next build. A spike with
              no annotation is a question; a spike next to one is an answer.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Patient bookings, monthly</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">
            Monthly in the source system: {pulse.bookings_monthly.length} points, not a trend line. The total grows because
            the book grows; bookings per doctor is the fair read.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Month</th>
                <th className="py-1.5 pr-3 text-right font-medium">Patient bookings</th>
                <th className="py-1.5 pr-3 text-right font-medium">Doctors with bookings</th>
                <th className="py-1.5 text-right font-medium">Per doctor</th>
              </tr>
            </thead>
            <tbody>
              {pulse.bookings_monthly.map((m) => (
                <tr key={m.month} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3 text-foreground">
                    {new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{m.patient_bookings.toLocaleString("en-US")}</td>
                  <td className="py-1.5 pr-3 text-right">{m.doctors.toLocaleString("en-US")}</td>
                  <td className="py-1.5 text-right font-medium">{m.per_doctor.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}
