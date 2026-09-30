import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent } from "@/lib/format"
import type { AttentionItem } from "@/lib/types"

/** Attention keys that exist as a watchlist signal, so a row can open those doctors. */
const TO_SIGNAL: Record<string, string> = { churn_threat: "churn_threat", discouraged: "discouraged" }

export function AttentionList({
  attention,
  onOpenSignal,
}: {
  attention: AttentionItem[]
  onOpenSignal?: (signal: string) => void
}) {
  const maxLift = Math.max(...attention.map((a) => a.lift), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts requiring attention</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {attention.map((item) => (
          <div key={item.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              {onOpenSignal && TO_SIGNAL[item.key] ? (
                <button
                  type="button"
                  onClick={() => onOpenSignal(TO_SIGNAL[item.key])}
                  className="rounded text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label} →
                </button>
              ) : (
                <span className="text-sm font-medium text-foreground text-pretty">{item.label}</span>
              )}
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatPercent(item.churn, 1)} churn
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.doctors.toLocaleString("en-US")} doctors · {item.active.toLocaleString("en-US")} active
            </p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/70"
                  style={{ width: `${Math.min(100, (item.lift / maxLift) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {item.lift.toFixed(2)}× churn
              </span>
            </div>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          Churn lift vs the portfolio baseline, measured on this data.
        </p>
      </CardContent>
    </Card>
  )
}
