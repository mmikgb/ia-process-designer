"use client"

// Señales (T5.5): what the specialists wrote in their notes and how much it weighs in
// cancellations. Themes are tagged by rules in notes.py and ranked by measured churn lift in
// insight.py; this screen only splits them at lift 1 (above the baseline or not).
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import { ExplainButton } from "@/components/ai/explain"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { listHref } from "@/lib/lists"
import type { Theme } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Themes that are also attention signals, so a row can open exactly those doctors. */
const SIGNAL: Record<string, string> = { churn_threat: "churn_threat", discouraged: "discouraged" }

export function SignalsScreen({ themes }: { themes: Theme[] }) {
  const { t, tx, num } = useT()
  const hot = themes.filter((x) => x.lift > 1)
  const rest = themes.filter((x) => x.lift <= 1)
  const top = themes[0]
  return (
    <>
      <section className="flex flex-col gap-2">
        {top && <p className="max-w-3xl text-lg font-medium text-foreground text-pretty">{t("signals.finding", { top: tx(top.label), lift: num(top.lift, 1) })}</p>}
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">{t("signals.sub")}</p>
      </section>
      <ThemeList title={t("signals.predictive")} themes={hot} strong />
      <ThemeList title={t("signals.rest")} sub={t("signals.rest.sub")} themes={rest} />
    </>
  )
}

function ThemeList({ title, sub, themes, strong = false }: { title: string; sub?: string; themes: Theme[]; strong?: boolean }) {
  const { t, tx, num, pct } = useT()
  const { scope } = useIdentity()
  if (!themes.length) return null
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>{title}</CardTitle>
        {sub && <p className="text-sm text-muted-foreground text-pretty">{sub}</p>}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {themes.map((th) => {
            const signal = SIGNAL[th.tag]
            return (
              <li key={th.tag} data-theme={th.tag} className="py-3 first:pt-0 last:pb-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-foreground">{tx(th.label)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t("signals.notes", { n: num(th.notes) })} · {t("signals.doctors", { n: num(th.doctors) })} · {t("signals.churn", { p: pct(th.churn, 1) })}
                      </span>
                    </div>
                    <div className="hidden h-8 w-28 sm:block" title={t("signals.trend")} aria-hidden>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={th.trend} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
                          <Line type="monotone" dataKey="n" stroke="var(--color-chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <span
                      title={t("signals.lift.title")}
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums",
                        strong && th.lift >= 2 ? "bg-chip-red text-chip-red-fg" : strong ? "bg-chip-amber text-chip-amber-fg" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t("signals.lift", { x: num(th.lift, 2) })}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/50 px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground">{t("signals.examples")}</span>
                    {th.examples.map((e, i) => (
                      <blockquote key={i} className="border-l-2 border-primary/40 pl-3 text-sm text-foreground italic">
                        {e}
                      </blockquote>
                    ))}
                    {signal && (
                      <div className="flex items-center gap-2 pt-1">
                        <Link href={listHref(scope, { signal })} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                          {t("signals.open")} →
                        </Link>
                        <ExplainButton kind="signal" itemKey={signal} scope={scope} label={tx(th.label)} />
                      </div>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
