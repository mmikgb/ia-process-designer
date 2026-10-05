"use client"

// "¿Cómo se calcula?": the table pipeline.risk() adds up, from the bundle (RISK_WEIGHTS), with
// the rules this doctor meets highlighted. Nothing is computed here.
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/lib/i18n"
import { useShell } from "@/lib/shell"
import { cn } from "@/lib/utils"

export function RiskExplainer({ applied, className }: { applied: string[]; className?: string }) {
  const { t, tx, num, pct } = useT()
  const risk = useShell().risk
  if (!risk) return null
  const on = new Set(applied)
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 rounded text-xs font-medium text-muted-foreground normal-case hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
        {t("risk.how")}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">{t("risk.how.title")}</span>
        <p className="text-xs text-pretty text-muted-foreground">{t("risk.how.intro", { cap: num(risk.cap, 2) })}</p>
        <table className="w-full text-xs" data-testid="risk-rules">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">{t("risk.how.rule")}</th>
              <th className="py-1 pr-2 text-right font-medium">{t("risk.how.points")}</th>
              <th className="py-1 text-right font-medium">{t("risk.how.churn")}</th>
            </tr>
          </thead>
          <tbody>
            {risk.rules.map((r) => (
              <tr key={r.key} className={cn("border-b border-border last:border-0", on.has(r.key) ? "bg-chip-amber font-medium text-chip-amber-fg" : "text-foreground")}>
                <td className="py-1 pr-2 text-pretty">{tx(r.label)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">+{num(r.points, 2)}</td>
                <td className="py-1 text-right tabular-nums">{pct(r.churn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-pretty text-muted-foreground">{t("risk.how.base", { p: pct(risk.baseline_churn) })}</p>
        <p className="text-xs text-muted-foreground">{t("risk.how.critical")}</p>
      </PopoverContent>
    </Popover>
  )
}
