import { PulseScreen } from "@/components/pulse/pulse-screen"
import { Framed } from "@/components/screens/simple"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as unknown as OverviewData

export const metadata = { title: "Pulse · CS Control Room" }

export default function Page() {
  return (
    <Framed title="nav.pulse" subtitle="pulse.subtitle">
      <PulseScreen data={data} />
    </Framed>
  )
}
