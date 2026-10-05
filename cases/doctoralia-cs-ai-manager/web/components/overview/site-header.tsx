import { SessionSwitch, SiteNav } from "@/components/site-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import type { Meta, Specialist } from "@/lib/types"

export function SiteHeader({ meta, asof, specialists }: { meta: Meta; asof: string; specialists: Specialist[] }) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">CS Control Room</h1>
        <p className="text-sm text-muted-foreground">
          Data as of <span className="font-medium text-foreground">{asof}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          source {meta.source_file} · sha {meta.source_sha256_16}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 lg:items-end">
        <div className="flex items-center gap-2">
          <SessionSwitch specialists={specialists} />
          <ThemeToggle />
        </div>
        <SiteNav />
      </div>
    </header>
  )
}
