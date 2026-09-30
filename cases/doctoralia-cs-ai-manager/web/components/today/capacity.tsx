"use client"

import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Day } from "@/lib/day"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-foreground">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value))
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className="h-8 w-20 rounded-lg border border-input bg-card px-2 text-right text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
    </label>
  )
}

/** Miguel's call: capacity, follow-up quota and window are RULES defaults each person can change live. */
export function CapacityControl({ day }: { day: Day }) {
  const { t } = useT()
  const { opts, defaults } = day
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-lg border bg-card px-3 text-xs font-medium shadow-card transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          day.custom ? "border-chip-amber-fg/40 text-chip-amber-fg" : "border-border text-muted-foreground",
        )}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {t("cap.chip", { c: opts.capacity, q: opts.quota })}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{t("cap.title")}</span>
          <span className="text-xs text-muted-foreground">{t("cap.body")}</span>
        </div>
        <Stepper label={t("cap.capacity")} value={opts.capacity} min={1} max={80} onChange={(capacity) => day.setOpts({ capacity })} />
        <Stepper label={t("cap.quota")} value={opts.quota} min={0} max={80} onChange={(quota) => day.setOpts({ quota })} />
        <Stepper label={t("cap.window")} value={opts.window} min={0} max={120} onChange={(window) => day.setOpts({ window })} />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {t("cap.defaults", { c: defaults.capacity, q: defaults.quota, w: defaults.window })}
          </span>
          <Button size="sm" variant="outline" onClick={() => day.setOpts(null)} disabled={!day.custom}>
            {t("cap.reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
