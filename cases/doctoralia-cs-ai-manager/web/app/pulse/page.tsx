import { PulseScreen } from "@/components/pulse/pulse-screen"
import { SiteHeader } from "@/components/overview/site-header"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as OverviewData

export const metadata = { title: "Pulse · CS Control Room" }

export default function PulsePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <SiteHeader meta={data.meta} asof={data.kpi.asof} />
      <PulseScreen data={data} />
    </main>
  )
}
