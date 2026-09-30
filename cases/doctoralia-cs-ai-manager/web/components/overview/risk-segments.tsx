"use client"

// The active book by risk band: one stacked bar and a legend. Every count opens its list.
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT, type Key } from "@/lib/i18n"
import { listHref } from "@/lib/lists"
import type { SegmentItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const COLOR: Record<string, string> = {
  healthy: "bg-risk-healthy",
  watch: "bg-risk-watch",
  at_risk: "bg-risk-atrisk",
  critical: "bg-risk-critical",
}

export function RiskSegments({ segments, scope = "all" }: { segments: SegmentItem[]; scope?: string }) {
  const { t, tx, num, pct } = useT()
  const total = segments.reduce((a, s) => a + s.n, 0)
  const name = (s: SegmentItem) => (s.key ? t(`band.${s.key}` as Key) : tx(s.band))
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>{t("summary.segments")}</CardTitle>
        <p className="text-sm text-muted-foreground text-pretty">{t("summary.segments.sub")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{num(total)}</span>
          <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full">
            {segments.map((s) => (
              <div
                key={s.key ?? tx(s.band)}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", COLOR[s.key ?? ""] ?? "bg-muted-foreground")}
                style={{ width: `${s.share * 100}%` }}
                title={`${name(s)}: ${pct(s.share, 1)}`}
              />
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {segments.map((s) => (
            <li key={s.key ?? tx(s.band)} className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={cn("size-2.5 rounded-full", COLOR[s.key ?? ""] ?? "bg-muted-foreground")} aria-hidden />
                {name(s)}
              </span>
              <span className="flex items-baseline gap-2">
                {s.key ? (
                  <Link
                    href={listHref(scope, { risk_band: s.key })}
                    data-count={`band:${s.key}`}
                    className="text-xl font-semibold text-foreground tabular-nums underline-offset-4 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {num(s.n)}
                  </Link>
                ) : (
                  <span className="text-xl font-semibold text-foreground tabular-nums">{num(s.n)}</span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">{pct(s.share, 1)}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
