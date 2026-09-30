"use client"

// The attention signals, ranked by measured churn lift: how many active doctors carry each
// (a link to exactly those doctors) and how much more those who had it churned.
import Link from "next/link"
import { AlertTriangle, CalendarX, Frown, GraduationCap, MessageSquareWarning, TrendingDown } from "lucide-react"
import { ExplainButton } from "@/components/ai/explain"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT, type Key } from "@/lib/i18n"
import { listHref } from "@/lib/lists"
import type { AttentionItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const ICON: Record<string, typeof AlertTriangle> = {
  churn_threat: AlertTriangle,
  discouraged: Frown,
  grade_d: GraduationCap,
  bottom_q: TrendingDown,
  calendar_off: CalendarX,
  complaint: MessageSquareWarning,
}

export function AttentionList({ attention, scope = "all" }: { attention: AttentionItem[]; scope?: string }) {
  const { t, num, pct } = useT()
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>{t("summary.attention")}</CardTitle>
        <p className="text-sm text-muted-foreground text-pretty">{t("summary.attention.sub")}</p>
      </CardHeader>
      <CardContent className="flex flex-col">
        <ul className="flex flex-col divide-y divide-border">
          {attention.map((a) => {
            const Icon = ICON[a.key] ?? AlertTriangle
            const hot = a.lift >= 2
            return (
              <li key={a.key} className="flex items-center gap-3 py-3 first:pt-0">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    hot ? "bg-chip-red text-chip-red-fg" : "bg-chip-amber text-chip-amber-fg",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-foreground text-pretty">{t(`signal.${a.key}` as Key)}</span>
                  <span className="text-xs text-muted-foreground">
                    <Link
                      href={listHref(scope, { signal: a.key })}
                      data-count={`signal:${a.key}`}
                      className="font-medium text-primary tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t("summary.attention.active", { n: num(a.active) })}
                    </Link>{" "}
                    {t("summary.attention.of", { n: num(a.doctors) })} · {t("summary.attention.churn", { p: pct(a.churn, 1) })}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums",
                    hot ? "bg-chip-red text-chip-red-fg" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t("summary.attention.lift", { x: num(a.lift, 1) })}
                </span>
                <ExplainButton kind="signal" itemKey={a.key} scope={scope} label={t(`signal.${a.key}` as Key)} />
              </li>
            )
          })}
        </ul>
        <p className="pt-3 text-xs text-muted-foreground">{t("summary.attention.note")}</p>
      </CardContent>
    </Card>
  )
}
