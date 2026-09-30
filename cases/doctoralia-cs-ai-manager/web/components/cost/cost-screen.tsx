"use client"

// /costo: the live AI panel (T4.8: status, kill switch, budget, spend, calls by task and by
// specialist, cache hit rate) over the daily-use estimate computed in src/llm.py, then the
// one-off enrichment bake and the prices. No number here is computed in the browser except
// the ratios the live panel shows from the ledger.
import { useEffect, useState } from "react"
import { CheckCircle2, PowerOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { modelName, refreshAiStatus, useAiStatus, type AiStatus } from "@/lib/ai/client"
import { useT, type Key } from "@/lib/i18n"
import { useShell } from "@/lib/shell"
import type { Cost } from "@/lib/types"
import { cn } from "@/lib/utils"

const usd = (v: number) => (v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`)

const th = "py-2 pr-3 font-medium"
const td = "py-2 pr-3"

export function CostScreen({ cost }: { cost: Cost }) {
  const { t, num, pct } = useT()
  const e = cost.estimate
  const u = cost.usage_v2
  const ai = useAiStatus()
  const dedupe = cost.notes_total && e.unique_notes_all ? cost.notes_total / e.unique_notes_all : null
  const budget = ai?.budget ?? cost.monthly_budget_usd

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("cost.q")}</h2>
        <LivePanel ai={ai} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="cost-est">
        <h3 id="cost-est" className="text-base font-semibold text-foreground">
          {t("cost.est.title")}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: t("cost.est.per"), value: usd(u.per_specialist_usd), hint: t("cost.est.per.hint", { days: u.working_days }) },
            { label: t("cost.est.team"), value: usd(u.team_usd), hint: t("cost.est.team.hint", { n: u.specialists }) },
            { label: t("cost.est.rec"), value: usd(u.recommended_budget_usd), hint: t("cost.est.rec.hint", { budget: budget != null ? usd(budget) : "—" }) },
            { label: t("cost.est.cap"), value: budget != null ? usd(budget) : "—", hint: t("cost.est.cap.hint") },
          ].map((k) => (
            <Card key={k.label} className="gap-1 py-4">
              <CardContent className="flex flex-col gap-1 px-4">
                <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                <span className="text-3xl font-semibold tabular-nums text-foreground">{k.value}</span>
                <span className="text-xs text-muted-foreground text-pretty">{k.hint}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="flex flex-col gap-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className={th}>{t("cost.col.task")}</th>
                  <th className={th}>{t("cost.col.model")}</th>
                  <th className={cn(th, "text-right")}>{t("cost.col.per_day")}</th>
                  <th className={cn(th, "text-right")}>{t("cost.col.tokens")}</th>
                  <th className={cn(th, "text-right")}>{t("cost.col.per_call")}</th>
                  <th className="py-2 text-right font-medium">{t("cost.col.month")}</th>
                </tr>
              </thead>
              <tbody>
                {u.rows.map((r) => (
                  <tr key={r.task} className="border-b border-border last:border-0">
                    <td className={cn(td, "text-foreground")}>
                      {t(`cost.task.${r.task}` as Key)}
                      {r.note && <span className="ml-1.5 text-xs text-muted-foreground">({t(`cost.note.${r.note}` as Key)})</span>}
                    </td>
                    <td className={cn(td, "text-muted-foreground")}>
                      {t(r.tier === "fast" ? "cost.model.fast" : "cost.model.deep")} · {modelName(r.model)}
                    </td>
                    <td className={cn(td, "text-right")}>{num(r.per_day)}</td>
                    <td className={cn(td, "text-right")}>
                      {num(r.tokens_in)} / {num(r.tokens_out)}
                    </td>
                    <td className={cn(td, "text-right")}>${r.usd_per_call.toFixed(4)}</td>
                    <td className="py-2 text-right">{usd(r.usd_month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground text-pretty">{t("cost.est.note")}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("cost.bake.title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className={th}>{t("cost.bake.job")}</th>
                <th className={th}>{t("cost.bake.unit")}</th>
                <th className={cn(th, "text-right")}>{t("cost.bake.tin")}</th>
                <th className="py-2 text-right font-medium">{t("cost.col.cost")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className={cn(td, "text-foreground")}>{t("cost.bake.themes")}</td>
                <td className={cn(td, "text-muted-foreground")}>{t("cost.bake.notes", { n: num(e.unique_notes_all) })}</td>
                <td className={cn(td, "text-right")}>{num(e.tokens_all)}</td>
                <td className="py-2 text-right">{usd(e.themes_usd)}</td>
              </tr>
              <tr className="border-b border-border">
                <td className={cn(td, "text-foreground")}>{t("cost.bake.sums")}</td>
                <td className={cn(td, "text-muted-foreground")}>{t("cost.bake.docs", { n: num(e.summaries_doctors) })}</td>
                <td className={cn(td, "text-right")}>—</td>
                <td className="py-2 text-right">{usd(e.summaries_usd)}</td>
              </tr>
              <tr>
                <td className={cn(td, "font-semibold text-foreground")}>{t("cost.bake.total")}</td>
                <td />
                <td />
                <td className="py-2 text-right font-semibold text-foreground">{usd(e.total_usd)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("cost.dec.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
              <li className="text-pretty">
                <span className="font-medium">{t("cost.dec.1")}</span>{" "}
                {cost.notes_total != null &&
                  dedupe != null &&
                  t("cost.dec.1.body", { notes: num(cost.notes_total), unique: num(e.unique_notes_all), x: num(Math.round(dedupe)) })}
              </li>
              <li className="text-pretty">
                <span className="font-medium">{t("cost.dec.2")}</span> {t("cost.dec.2.body", { pct: pct(cost.batch_discount) })}
              </li>
              <li className="text-pretty">
                <span className="font-medium">{t("cost.dec.3")}</span> {t("cost.dec.3.body")}
              </li>
            </ol>
            <p className="pt-3 text-xs text-muted-foreground text-pretty">{t("cost.dec.note")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("cost.prices")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{t("cost.col.model")}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{t("cost.col.in")}</th>
                  <th className="py-1.5 text-right font-medium">{t("cost.col.out")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cost.prices).map(([m, p]) => (
                  <tr key={m} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs text-foreground">{m}</td>
                    <td className="py-1.5 pr-3 text-right">{usd(p.in)}</td>
                    <td className="py-1.5 text-right">{usd(p.out)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground text-pretty">{t("cost.prices.note")}</p>
          </CardContent>
        </Card>
      </div>

      <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground text-pretty">
        {t("cost.close", { n: cost.farming_specialists })}
      </p>
    </>
  )
}

function LivePanel({ ai }: { ai: AiStatus | null }) {
  const { t, num, pct } = useT()
  const shell = useShell()
  const [budget, setBudget] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (ai) setBudget(String(ai.budget))
  }, [ai])

  if (!ai)
    return (
      <p className="flex max-w-3xl items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground text-pretty">
        <PowerOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        {t("cost.live.off")}
      </p>
    )

  const save = async (patch: { ai_runtime_enabled?: boolean; monthly_budget_usd?: number }) => {
    setSaving(true)
    try {
      await fetch("/api/ai/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) })
    } finally {
      await refreshAiStatus()
      setSaving(false)
    }
  }
  const reason = t(`ai.reason.${ai.reason}` as Key)
  const used = ai.budget > 0 ? Math.min(ai.spend_30d / ai.budget, 1) : 1
  const name = (id: string) => (id === "—" ? t("cost.nobody") : (shell.specialists.find((s) => s.id === id)?.name ?? id))
  const task = (k: string) => t(`cost.task.${k}` as Key)
  const typed = Number(budget)
  const budgetOk = budget.trim() !== "" && Number.isFinite(typed) && typed >= 0 && typed !== ai.budget

  return (
    <Card data-testid="cost-live">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t("cost.live")}</CardTitle>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            ai.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {ai.enabled ? <CheckCircle2 className="size-3.5" aria-hidden /> : <PowerOff className="size-3.5" aria-hidden />}
          {ai.enabled ? (ai.mock ? t("ai.src.mock") : t("cost.state.on")) : reason.charAt(0).toUpperCase() + reason.slice(1)}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("cost.switch")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={ai.ai_runtime_enabled}
              disabled={saving}
              onClick={() => void save({ ai_runtime_enabled: !ai.ai_runtime_enabled })}
              className="flex w-fit items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              <span className={cn("relative h-5 w-9 rounded-full transition-colors", ai.ai_runtime_enabled ? "bg-primary" : "bg-muted-foreground/30")}>
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", ai.ai_runtime_enabled ? "left-4.5" : "left-0.5")} />
              </span>
              {ai.ai_runtime_enabled ? t("cost.switch.on") : t("cost.switch.off")}
            </button>
            <p className="text-xs text-muted-foreground text-pretty">{ai.reason === "disabled" ? t("cost.env") : t("cost.switch.note")}</p>
          </div>

          <form
            className="flex flex-col gap-2"
            onSubmit={(ev) => {
              ev.preventDefault()
              if (budgetOk) void save({ monthly_budget_usd: typed })
            }}
          >
            <label htmlFor="cost-budget" className="text-xs font-medium text-muted-foreground">
              {t("cost.budget")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cost-budget"
                type="number"
                min={0}
                max={10000}
                step={5}
                value={budget}
                onChange={(ev) => setBudget(ev.target.value)}
                className="h-9 w-28 rounded-lg border border-input bg-background px-3 text-sm tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <button
                type="submit"
                disabled={!budgetOk || saving}
                className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
              >
                {t("cost.budget.save")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-pretty">{t("cost.budget.note")}</p>
          </form>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("cost.spend")}</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {t("cost.spend.of", { spend: usd(ai.spend_30d), budget: usd(ai.budget) })}
            </span>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-label={t("cost.spend")}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={used}
            >
              <div className={cn("h-full rounded-full", used >= 0.8 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(used * 100, 1)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">
              {t("cost.models")}: {t("cost.model.fast")} · {modelName(ai.models.fast)}, {t("cost.model.deep")} · {modelName(ai.models.deep)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("cost.calls"), value: num(ai.calls) },
            { label: t("cost.fallbacks"), value: num(ai.fallbacks) },
            { label: t("cost.cache"), value: ai.cache_hit == null ? "—" : pct(ai.cache_hit) },
          ].map((k) => (
            <div key={k.label} className="flex flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">{k.value}</span>
            </div>
          ))}
        </div>

        {ai.calls === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cost.none")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Breakdown title={t("cost.by_task")} head={t("cost.col.task")} rows={ai.by_task} label={task} />
            <Breakdown title={t("cost.by_owner")} head={t("cost.col.who")} rows={ai.by_owner} label={name} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Breakdown({
  title,
  head,
  rows,
  label,
}: {
  title: string
  head: string
  rows: Record<string, { calls: number; fallbacks: number; cost: number }>
  label: (k: string) => string
}) {
  const { t, num } = useT()
  const list = Object.entries(rows).sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls)
  return (
    <div className="flex flex-col gap-1.5 overflow-x-auto">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">{head}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{t("cost.col.calls")}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{t("cost.col.fallbacks")}</th>
            <th className="py-1.5 text-right font-medium">{t("cost.col.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map(([k, v]) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3 text-foreground">{label(k)}</td>
              <td className="py-1.5 pr-3 text-right">{num(v.calls)}</td>
              <td className="py-1.5 pr-3 text-right">{num(v.fallbacks)}</td>
              <td className="py-1.5 text-right">{usd(v.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
