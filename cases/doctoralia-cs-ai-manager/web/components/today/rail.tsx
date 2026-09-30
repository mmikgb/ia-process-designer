"use client"

import { Undo2 } from "lucide-react"
import { OUTCOME_LABEL } from "@/components/today/outcome-menu"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Day } from "@/lib/day"
import { addBusinessDays } from "@/lib/dates"
import type { Outcome } from "@/lib/dayplan"
import { useT } from "@/lib/i18n"

/** "Hecho hoy" with undo, and "Vuelven mañana". */
export function Rail({ day }: { day: Day }) {
  const { t, day: fmt } = useT()
  const tomorrow = addBusinessDays(day.today, 1)
  const back = day.returning.filter((r) => r.due === tomorrow)
  const later = day.returning.length - back.length
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3 py-5">
        <h2 className="px-5 text-[15px] font-semibold text-foreground">{t("today.done.title")}</h2>
        {day.done.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">{t("today.done.empty")}</p>
        ) : (
          <ul className="flex flex-col px-3">
            {day.done.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{e.doctor_name ?? e.doctor_id}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t(OUTCOME_LABEL[e.outcome as Outcome])}
                    {e.next_due && ` · ${t("outcome.returns", { date: fmt(e.next_due) })}`}
                  </span>
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`${t("today.undo")}: ${e.doctor_name ?? e.doctor_id}`}
                  title={t("today.undo")}
                  onClick={() => void day.log({ doctor_id: e.doctor_id, doctor_name: e.doctor_name ?? undefined, play: e.play }, "undo", { undo_of: e.id })}
                >
                  <Undo2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="gap-3 py-5">
        <h2 className="px-5 text-[15px] font-semibold text-foreground">
          {t("today.returning.title")} <span className="font-normal text-muted-foreground">· {fmt(tomorrow)}</span>
        </h2>
        {back.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">{t("today.returning.empty")}</p>
        ) : (
          <ul className="flex flex-col px-3">
            {back.map((r) => (
              <li key={r.item.doctor_id} className="flex flex-col rounded-lg px-2 py-2">
                <span className="truncate text-sm font-medium text-foreground">{r.item.doctor_name}</span>
                <span className="text-xs text-muted-foreground">{t(OUTCOME_LABEL[r.state.outcome])}</span>
              </li>
            ))}
          </ul>
        )}
        {later > 0 && <p className="px-5 text-xs text-muted-foreground">{t("today.returning.more", { n: later })}</p>}
      </Card>
    </div>
  )
}
