import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { Totals } from "@/lib/types"

export function HeroCard({
  healthScore,
  healthNote,
  totals,
}: {
  healthScore: number
  healthNote: string
  totals: Totals
}) {
  return (
    <Card className="overflow-hidden rounded-xl border-border">
      <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Portfolio health score
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-primary sm:text-7xl">
              {healthScore.toFixed(1)}
            </span>
            <span className="text-lg font-medium text-muted-foreground">/100</span>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground text-pretty">
            {healthNote}
          </p>
        </div>

        <Separator orientation="vertical" className="hidden self-stretch sm:block" />
        <Separator className="sm:hidden" />

        <div className="grid grid-cols-3 gap-4 sm:gap-6">
          <TotalStat label="Active" value={totals.active} />
          <TotalStat label="Churned" value={totals.churned} />
          <TotalStat label="Specialists" value={totals.specialists} />
        </div>
      </CardContent>
    </Card>
  )
}

function TotalStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString("en-US")}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
