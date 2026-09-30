"use client"

import { CalendarClock, CalendarPlus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useClock } from "@/lib/clock"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** "Datos al 25 sep", and in snapshot mode the demo control to move the day. */
export function ClockChip() {
  const { t, day, dayLong } = useT()
  const clock = useClock()
  const moved = clock.offset > 0
  const label =
    clock.mode === "real"
      ? t("clock.real", { date: day(clock.today) })
      : moved
        ? t("clock.simulated", { date: day(clock.today) })
        : t("clock.snapshot", { date: day(clock.asof) })
  const chip = cn(
    "flex h-9 shrink-0 items-center gap-2 rounded-lg border bg-card px-3 text-sm whitespace-nowrap shadow-card",
    moved ? "border-chip-amber-fg/40 text-chip-amber-fg" : "border-border text-muted-foreground",
  )
  if (clock.mode === "real") {
    return (
      <span className={cn(chip, "hidden lg:flex")}>
        <CalendarClock className="size-4" aria-hidden />
        {label}
      </span>
    )
  }
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(chip, "transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
      >
        <CalendarClock className="size-4" aria-hidden />
        <span className="hidden lg:inline">{label}</span>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground first-letter:uppercase">{dayLong(clock.today)}</span>
          <p className="text-xs text-pretty text-muted-foreground">{t("clock.note", { date: day(clock.asof) })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={clock.advance}>
            <CalendarPlus />
            {t("clock.next")}
          </Button>
          <Button size="sm" variant="outline" onClick={clock.reset} disabled={!moved}>
            <RotateCcw />
            {t("clock.reset", { date: day(clock.asof) })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
