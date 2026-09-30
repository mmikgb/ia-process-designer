import { SummaryScreen } from "@/components/screens/summary"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as unknown as OverviewData

export const metadata = { title: "Resumen · CS Control Room" }

export default function SummaryPage() {
  return <SummaryScreen data={data} />
}
