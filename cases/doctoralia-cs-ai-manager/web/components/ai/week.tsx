"use client"

// T4.4 manager variant on /resumen: "Qué pasó esta semana", real vs noise from the control charts.
import { useEffect } from "react"
import { ContextButton, Flagged, RegenerateButton, SourceBadge } from "@/components/ai/bits"
import { Skeleton } from "@/components/ui/skeleton"
import { useAi } from "@/lib/ai/client"
import { useClock } from "@/lib/clock"
import { actorOf } from "@/lib/day"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"

export function WeekCard() {
  const { t, locale } = useT()
  const { who, scope, ready } = useIdentity()
  const clock = useClock()
  const ai = useAi<string>("/api/ai/briefing")
  const run = ai.run
  const body = (refresh = false) => ({ scope, app_day: clock.today, locale, actor: actorOf(who), refresh })
  useEffect(() => {
    if (!ready || !who) return // the book is not known until the identity is
    void run(body())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ready, who, scope, clock.today, locale])
  return (
    <div className="flex min-h-40 flex-col gap-3 rounded-lg bg-linear-to-br from-[#005446] via-[#006a59] to-[#00806a] p-6 text-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("summary.week")}</h2>
        <span className="flex flex-wrap items-center gap-1">
          <SourceBadge meta={ai.meta} onDark />
          <ContextButton context={ai.context} onDark />
          <RegenerateButton onClick={() => void run(body(true))} disabled={ai.loading} onDark />
        </span>
      </div>
      {ai.text ? (
        <p className="max-w-3xl text-[15px] leading-relaxed whitespace-pre-line text-white/95">
          <Flagged text={ai.text} numbers={ai.meta?.flags.unverified_numbers ?? []} />
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4 bg-white/20" />
          <Skeleton className="h-4 w-2/3 bg-white/20" />
          <Skeleton className="h-4 w-1/2 bg-white/20" />
        </div>
      )}
      <p className="text-xs text-white/75">{t("summary.week.note")}</p>
    </div>
  )
}
