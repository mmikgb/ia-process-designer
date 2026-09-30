import { ControlScreen } from "@/components/control/control-screen"
import { Framed } from "@/components/screens/simple"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as unknown as OverviewData

export const metadata = { title: "Control · CS Control Room" }

export default function Page() {
  return (
    <Framed title="nav.control" subtitle="control.subtitle">
      <ControlScreen data={data} />
    </Framed>
  )
}
