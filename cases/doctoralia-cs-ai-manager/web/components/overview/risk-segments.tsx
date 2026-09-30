import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import { listHref } from "@/lib/lists"
import type { SegmentItem } from "@/lib/types"

const BAND_COLOR: Record<string, string> = {
  Healthy: "bg-risk-healthy",
  Watch: "bg-risk-watch",
  "At risk": "bg-risk-atrisk",
  Critical: "bg-risk-critical",
}

export function RiskSegments({ segments, scope = "all" }: { segments: SegmentItem[]; scope?: string }) {
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
                {seg.key ? (
                  <Link
                    href={listHref(scope, { risk_band: seg.key })}
                    data-count={`band:${seg.key}`}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {seg.n.toLocaleString("en-US")}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-foreground">{seg.n.toLocaleString("en-US")}</span>
                )}
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
