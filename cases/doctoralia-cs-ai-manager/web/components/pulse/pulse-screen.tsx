"use client"

// Pulse: what happened, day by day. Every row's title is its finding (series._finding, from
// Python); the browser only lays the rows on one calendar and sums counts inside the range
// the manager picks, which is filtering, not a new metric.
import { useMemo, useState } from "react"
import { Bar, Brush, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ExplainButton } from "@/components/ai/explain"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT } from "@/lib/i18n"
import type { Pulse, PulseRow } from "@/lib/types"

type Cell = { date: string; n: number | null; r7: number | null }

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
  const { t, day, num, pct } = useT()
  if (!active || !payload?.length) return null
  const c = payload[0].payload
  if (c.n == null && c.r7 == null) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-foreground px-3 py-2 text-xs text-background shadow-lg">
      <span className="font-semibold">{day(c.date)}</span>
      {!rate && c.n != null && <span className="tabular-nums">{t("pulse.tip.day", { n: num(c.n) })}</span>}
      {c.r7 != null && <span className="tabular-nums">{t("pulse.tip.r7", { v: rate ? pct(c.r7) : num(c.r7, 1) })}</span>}
    </div>
  )
}

export function PulseScreen({ pulse }: { pulse: Pulse }) {
  const { t, tx, day, num, pct, locale } = useT()
  const { dates, byRow } = useMemo(() => onCalendar(pulse.rows), [pulse.rows])
  const [range, setRange] = useState<[number, number]>([0, dates.length - 1])
  const [from, to] = [dates[range[0]], dates[range[1]]]
  const full = range[0] === 0 && range[1] === dates.length - 1
  const events = pulse.events.filter((e) => e.date >= from && e.date <= to)
  const month = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { month: "long", year: "numeric" })

  const summary = pulse.rows
    .filter((r) => r.unit === "per day")
    .map((r) => {
      const inRange = r.points.filter((p) => p.date >= from && p.date <= to && p.n != null)
      const total = inRange.reduce((s, p) => s + (p.n ?? 0), 0)
      return { key: r.key, label: tx(r.label), days: inRange.length, total, perDay: inRange.length ? total / inRange.length : null }
    })
  const master = byRow[pulse.rows[0].key]

  return (
    <>
      <section className="flex flex-col gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">{t("pulse.intro")}</p>
        <p className="max-w-3xl rounded-lg bg-chip-amber px-3 py-2 text-sm text-foreground text-pretty">
          <span className="font-medium">{t("pulse.cannot")}</span> {tx(pulse.note)}
        </p>
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("pulse.range")}</CardTitle>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground tabular-nums">
              {day(from)} – {day(to)}
            </span>
            {!full && (
              <Button variant="outline" size="sm" onClick={() => setRange([0, dates.length - 1])}>
                {t("pulse.all")}
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
                  tickFormatter={(d: string) => day(d)}
                  stroke="var(--color-primary)"
                  fill="var(--color-card)"
                  onChange={(r: { startIndex?: number; endIndex?: number }) => r.startIndex != null && r.endIndex != null && setRange([r.startIndex, r.endIndex])}
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
            <Card key={r.key} data-pulse={r.key} className="gap-2 py-4">
              <CardHeader className="flex flex-row items-start justify-between gap-2 px-5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {tx(r.label)} · {t(rate ? "pulse.rate" : "pulse.bars")}
                  </span>
                  <CardTitle className="text-base text-pretty">{r.finding ? tx(r.finding) : tx(r.label)}</CardTitle>
                </div>
                <ExplainButton kind="pulse" itemKey={r.key} label={tx(r.label)} className="-mt-1 -mr-2" />
              </CardHeader>
              <CardContent className="px-5">
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rows} syncId="pulse" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => day(d)}
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
                        tickFormatter={rate ? (v: number) => pct(v) : undefined}
                        tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      />
                      <Tooltip content={<RowTooltip rate={rate} />} cursor={{ stroke: "var(--color-border)" }} />
                      {events.map((e) => (
                        <ReferenceLine key={`${e.date}${tx(e.label)}`} x={e.date} stroke="var(--color-muted-foreground)" strokeDasharray="2 3" strokeWidth={1} />
                      ))}
                      {!rate && <Bar dataKey="n" fill="var(--color-muted-foreground)" fillOpacity={0.25} isAnimationActive={false} />}
                      <Line dataKey="r7" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {r.zero_pattern && (
                  <p className="pt-2 text-xs text-warning text-pretty">{t("pulse.zero", { n: r.zero_days?.length ?? 0, pattern: tx(r.zero_pattern) })}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("pulse.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{t("pulse.col.series")}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{t("pulse.col.days")}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{t("pulse.col.total")}</th>
                  <th className="py-1.5 text-right font-medium">{t("pulse.col.perday")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.key} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 text-foreground">{s.label}</td>
                    <td className="py-1.5 pr-3 text-right">{num(s.days)}</td>
                    <td className="py-1.5 pr-3 text-right">{num(s.total)}</td>
                    <td className="py-1.5 text-right">{s.perDay == null ? "—" : num(s.perDay, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-2 text-xs text-muted-foreground">{t("pulse.summary.note")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pulse.events")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("pulse.events.none")}</p>
            ) : (
              <ol className="flex flex-col gap-1.5 text-sm">
                {events.map((e) => (
                  <li key={`${e.date}${tx(e.label)}`} className="flex gap-3">
                    <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{day(e.date)}</span>
                    <span className="text-foreground">{tx(e.label)}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="pt-1 text-xs text-muted-foreground text-pretty">{t("pulse.events.note")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>{t("pulse.bookings")}</CardTitle>
          <p className="text-sm text-muted-foreground text-pretty">{t("pulse.bookings.sub", { n: pulse.bookings_monthly.length })}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">{t("pulse.col.month")}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t("pulse.col.bookings")}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t("pulse.col.doctors")}</th>
                <th className="py-1.5 text-right font-medium">{t("pulse.col.perdoctor")}</th>
              </tr>
            </thead>
            <tbody>
              {pulse.bookings_monthly.map((m) => (
                <tr key={m.month} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3 text-foreground">{month.format(new Date(`${m.month}-15T12:00:00`))}</td>
                  <td className="py-1.5 pr-3 text-right">{num(m.patient_bookings)}</td>
                  <td className="py-1.5 pr-3 text-right">{num(m.doctors)}</td>
                  <td className="py-1.5 text-right font-medium">{num(m.per_doctor, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}
