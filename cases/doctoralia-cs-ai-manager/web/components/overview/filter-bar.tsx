"use client"

import { cn } from "@/lib/utils"
import type { Filters } from "@/lib/controls"
import type { OverviewData } from "@/lib/types"

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-input bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-md px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function FilterBar({
  data,
  filters,
  onChange,
}: {
  data: OverviewData
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Compare last</span>
        <Segmented
          label="Period"
          value={filters.period}
          onChange={(period) => onChange({ period })}
          options={data.periods.map((p) => ({ value: String(p), label: `${p} days` }))}
        />
      </div>

      <p className="ml-auto hidden max-w-xs text-xs text-muted-foreground lg:block">
        Thresholds are set in <span className="font-mono">pipeline.py</span>, not here: healthy agenda ≥{" "}
        {data.rules.calendar_healthy_slots} slots, pickup target {data.rules.escalation_pickup_target_min} min.
      </p>
    </div>
  )
}
