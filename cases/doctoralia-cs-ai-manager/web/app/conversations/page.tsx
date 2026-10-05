import { Suspense } from "react"
import { ConversationsScreen } from "@/components/conversations/conversations-screen"
import { SiteHeader } from "@/components/overview/site-header"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as OverviewData

export const metadata = { title: "Conversations · CS Control Room" }

export default function ConversationsPage() {
  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <SiteHeader meta={data.meta} asof={data.kpi.asof} specialists={data.specialists} />
      {/* useSearchParams (?open=) needs a Suspense boundary in a static build */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ConversationsScreen data={data} />
      </Suspense>
    </main>
  )
}
