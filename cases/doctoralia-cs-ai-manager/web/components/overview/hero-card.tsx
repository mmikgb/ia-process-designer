"use client"

import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n"
import type { Totals } from "@/lib/types"
import type { Text } from "@/lib/tx"

/** The health score (100 minus the mean risk of active doctors) and the book's size. */
export function HeroCard({ healthScore, healthNote, totals }: { healthScore: number; healthNote: Text; totals: Totals }) {
  const { t, tx, num } = useT()
  return (
    <Card className="flex-col gap-6 overflow-hidden border-0 bg-linear-to-br from-[#004d40] to-[#00806a] px-6 py-6 text-white sm:flex-row sm:items-center sm:gap-10 sm:px-8">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-white/75 uppercase">{t("summary.health")}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-6xl font-semibold tracking-tight tabular-nums">{num(healthScore, 1)}</span>
          <span className="text-lg font-medium text-white/70">{t("summary.health.of")}</span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-white/80 text-pretty">{tx(healthNote)}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:ml-auto sm:min-w-[360px]">
        {[
          { label: t("summary.totals.active"), value: totals.active },
          { label: t("summary.totals.churned"), value: totals.churned },
          { label: t("summary.totals.specialists"), value: totals.specialists },
        ].map((x) => (
          <div key={x.label} className="flex flex-col gap-0.5 rounded-xl bg-white/10 px-4 py-3">
            <span className="text-2xl font-semibold tabular-nums">{num(x.value)}</span>
            <span className="text-xs text-white/75">{x.label}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
