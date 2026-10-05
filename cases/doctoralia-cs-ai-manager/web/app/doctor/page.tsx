import { Suspense } from "react"
import { DoctorProfile } from "@/components/doctor/doctor-profile"
import { SiteHeader } from "@/components/overview/site-header"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as OverviewData

export const metadata = { title: "Doctor · CS Control Room" }

export default function DoctorPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <SiteHeader meta={data.meta} asof={data.kpi.asof} specialists={data.specialists} />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <DoctorProfile data={data} />
      </Suspense>
    </main>
  )
}
