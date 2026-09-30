"use client"

import { CalendarClock } from "lucide-react"
import { useT } from "@/lib/i18n"
import { useShell } from "@/lib/shell"

/** "Datos al 25 sep". T2.5 turns it into the clock menu (advance a day / back). */
export function ClockChip() {
  const { t, day } = useT()
  const shell = useShell()
  return (
    <span className="hidden h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm whitespace-nowrap text-muted-foreground shadow-card lg:flex">
      <CalendarClock className="size-4" aria-hidden />
      {t("clock.snapshot", { date: day(shell.asof) })}
    </span>
  )
}
