"use client"

import { cn } from "@/lib/utils"
import { COMPARE_LABEL, compareOptions, type Filters } from "@/lib/controls"
import type { OverviewData } from "@/lib/types"

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-2.5 pr-8 text-sm text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function FilterBar({
  data,
  filters,
  onChange,
  role,
}: {
  data: OverviewData
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  role: "manager" | "specialist"
}) {
  const options = compareOptions(filters.scope)
  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {role === "manager" ? (
        <Field label="Portfolio">
          <select
            className={selectClass}
            value={filters.scope}
            onChange={(e) => {
              const scope = e.target.value
              // a comparison that does not exist for the new scope falls back to the previous period
              onChange({ scope, compare: compareOptions(scope).includes(filters.compare) ? filters.compare : "prev" })
            }}
          >
            <option value="all">Whole portfolio</option>
            <optgroup label="Teams">
              {data.teams.map((t) => (
                <option key={t} value={`team:${t}`}>
                  {t}
                </option>
              ))}
            </optgroup>
            <optgroup label="Specialists">
              {data.specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.team.replace("Farming ", "")}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">My book</span>
          <span className="flex h-9 items-center text-sm font-medium text-foreground">
            {data.specialists.find((s) => s.id === filters.scope)?.name ?? filters.scope}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Compare with</span>
        <Segmented
          label="Compare with"
          value={filters.compare}
          onChange={(compare) => onChange({ compare })}
          options={options.map((c) => ({ value: c, label: COMPARE_LABEL[c] }))}
        />
      </div>

      <p className="ml-auto hidden max-w-xs text-xs text-muted-foreground lg:block">
        Thresholds are set in <span className="font-mono">pipeline.py</span>, not here: healthy agenda ≥{" "}
        {data.rules.calendar_healthy_slots} slots, pickup target {data.rules.escalation_pickup_target_min} min.
      </p>
    </div>
  )
}
