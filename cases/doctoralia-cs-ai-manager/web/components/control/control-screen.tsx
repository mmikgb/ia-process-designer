"use client"

// Control: is a movement real or noise? Order and reading are editorial; every value, limit,
// flag and finding comes from spc.py.
import { ControlChart, RULES, type Fmt } from "@/components/control/control-chart"
import { useT, type Key } from "@/lib/i18n"
import type { SpcChart, Team } from "@/lib/types"

const ORDER = ["onboarding_grade_d_daily", "onboarding_score_weekly", "pickup_weekly", "escalations_daily"]

export function ControlScreen({ spc, buckets }: { spc: Record<string, SpcChart>; buckets: Team["buckets"] }) {
  const { t, num, pct } = useT()
  const fmt: Record<string, Fmt> = {
    onboarding_grade_d_daily: (v) => pct(v),
    onboarding_score_weekly: (v) => num(v, 1),
    pickup_weekly: (v) => t("control.min", { v: num(v) }),
    escalations_daily: (v) => num(v, v % 1 ? 1 : 0),
  }
  // the pickup reading quotes the measured buckets rather than a typed number
  const [a, b] = [buckets[0], buckets[buckets.length - 1]]
  const reading = (k: string) =>
    t(`control.read.${k}` as Key) +
    (k === "pickup_weekly" && a && b && a !== b ? ` ${t("control.pickup.finding", { a: a.bucket, pa: pct(a.converted), b: b.bucket, pb: pct(b.converted) })}` : "")

  return (
    <>
      <section className="flex flex-col gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">{t("control.intro")}</p>
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          {RULES.map((r, i) => (
            <li key={r} className="rounded-xl border border-border bg-card px-4 py-3">
              <span className="font-medium text-foreground">
                {t("control.rule", { n: i + 1 })} · {t(`control.rule.${r}` as Key)}
              </span>
              <span className="block text-xs text-muted-foreground">{t(`control.rule.${r}.why` as Key)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {ORDER.filter((k) => spc[k]).map((k) => (
          <ControlChart key={k} chartKey={k} chart={spc[k]} fmt={fmt[k]} reading={reading(k)} />
        ))}
      </div>
    </>
  )
}
