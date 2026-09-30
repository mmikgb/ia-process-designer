import { CostScreen } from "@/components/cost/cost-screen"
import { Framed } from "@/components/screens/simple"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as unknown as OverviewData

export const metadata = { title: "Costo IA · CS Control Room" }

export default function Page() {
  return (
    <Framed title="nav.cost" subtitle="cost.subtitle">
      <CostScreen cost={data.cost} />
    </Framed>
  )
}
