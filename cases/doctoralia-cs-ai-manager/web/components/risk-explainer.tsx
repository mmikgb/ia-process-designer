import { formatPercent } from "@/lib/format"
import type { RiskRules } from "@/lib/types"

/**
 * How the risk score is built, from the same table pipeline.py adds up. Short on
 * purpose: a specialist should be able to read it in fifteen seconds.
 */
export function RiskExplainer({ risk, reasons }: { risk: RiskRules; reasons?: string | null }) {
  return (
    <details className="group rounded-lg border border-border bg-background text-sm">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        How is risk estimated?
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-xs text-muted-foreground text-pretty">
          No model: a sum of points, one rule per warning sign, capped at 100%. Each rule&apos;s points come from how
          often doctors with that sign cancelled in this data, against {formatPercent(risk.baseline_churn, 1)} for
          everyone. 50% or more counts as at risk.
          {reasons && " This doctor's points come from the reasons shown above."}
        </p>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Warning sign</th>
              <th className="py-1 pr-2 text-right font-medium">Points</th>
              <th className="py-1 text-right font-medium">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {risk.rules.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1 pr-2 text-foreground">{r.label}</td>
                <td className="py-1 pr-2 text-right font-medium">+{Math.round(r.points * 100)}</td>
                <td className="py-1 text-right text-muted-foreground">
                  {formatPercent(r.churn, 0)} <span className="text-[10px]">({r.lift.toFixed(1)}×)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground">
          Thresholds and points live in <span className="font-mono">pipeline.py</span>; this table is generated from it.
        </p>
      </div>
    </details>
  )
}
