"use client"

import { cn } from "@/lib/utils"
import type { Filters, Role } from "@/lib/controls"
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
}: {
  data: OverviewData
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
}) {
  const setRole = (role: Role) =>
    // A specialist always looks at one book; a manager starts from the whole portfolio.
    onChange({ role, scope: role === "specialist" ? data.specialists[0].id : "all" })

  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">View as</span>
        <Segmented
          label="View as"
          value={filters.role}
          onChange={setRole}
          options={[
            { value: "manager", label: "Manager" },
            { value: "specialist", label: "Specialist" },
          ]}
        />
      </div>

      <Field label={filters.role === "specialist" ? "My portfolio" : "Portfolio"}>
        <select
          className={selectClass}
          value={filters.scope}
          onChange={(e) => onChange({ scope: e.target.value })}
        >
          {filters.role === "manager" && (
            <>
              <option value="all">Whole portfolio</option>
              <optgroup label="Teams">
                {data.teams.map((t) => (
                  <option key={t} value={`team:${t}`}>
                    {t}
                  </option>
                ))}
              </optgroup>
            </>
          )}
          <optgroup label="Specialists">
            {data.specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.team.replace("Farming ", "")}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>

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
