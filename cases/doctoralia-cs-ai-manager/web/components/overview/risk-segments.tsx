import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import type { SegmentItem } from "@/lib/types"

const BAND_COLOR: Record<string, string> = {
  Healthy: "bg-risk-healthy",
  Watch: "bg-risk-watch",
  "At risk": "bg-risk-atrisk",
  Critical: "bg-risk-critical",
}

export function RiskSegments({ segments }: { segments: SegmentItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio by risk band</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((seg) => (
            <div
              key={seg.band}
              className={cn(BAND_COLOR[seg.band] ?? "bg-muted-foreground")}
              style={{ width: `${seg.share * 100}%` }}
              title={`${seg.band}: ${formatPercent(seg.share, 1)}`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {segments.map((seg) => (
            <div key={seg.band} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", BAND_COLOR[seg.band] ?? "bg-muted-foreground")}
                />
                <span className="text-sm text-foreground">{seg.band}</span>
              </div>
              <div className="flex items-baseline gap-2 tabular-nums">
                <span className="text-sm font-medium text-foreground">
                  {seg.n.toLocaleString("en-US")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatPercent(seg.share, 1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
