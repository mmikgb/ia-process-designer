import { Framed } from "@/components/screens/simple"
import { SignalsScreen } from "@/components/signals/signals-screen"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as unknown as OverviewData

export const metadata = { title: "Señales · CS Control Room" }

export default function SignalsPage() {
  return (
    <Framed title="nav.signals" subtitle="signals.subtitle">
      <SignalsScreen themes={data.themes ?? []} />
    </Framed>
  )
}
