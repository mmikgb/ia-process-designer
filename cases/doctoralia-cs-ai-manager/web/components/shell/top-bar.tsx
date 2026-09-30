"use client"

import { useState } from "react"
import { Bell, Menu, Search } from "lucide-react"
import { SidebarContent } from "@/components/shell/sidebar"
import { ClockChip } from "@/components/shell/clock-chip"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { useQueue } from "@/lib/queue"
import { cn } from "@/lib/utils"

export const PALETTE_EVENT = "cs:palette"

/** The header of every screen: what this is, what the system did, and the global tools. */
export function TopBar({ title, subtitle }: { title: React.ReactNode; subtitle?: React.ReactNode }) {
  const { t } = useT()
  const [menu, setMenu] = useState(false)
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Button variant="outline" size="icon" className="md:hidden" aria-label={t("nav.menu")} onClick={() => setMenu(true)}>
          <Menu />
        </Button>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-pretty text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
          aria-label={t("search.open")}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-card transition-colors hover:text-foreground sm:w-64 sm:flex-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{t("search.placeholder")}</span>
          <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
        </button>
        <ClockChip />
        <FollowupBell />
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" closeLabel={t("sheet.close")} className="w-72 max-w-[85vw]">
          <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
          <SidebarContent mobile onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>
    </header>
  )
}

function FollowupBell() {
  const { t } = useT()
  const { who } = useIdentity()
  const q = useQueue(who?.kind === "specialist" ? who.id : null)
  if (who?.kind !== "specialist") return null
  const n = q ? q.items.filter((x) => x.block === "followup").length : 0
  const label = n ? t("bell.followups", { n }) : t("bell.none")
  return (
    <span
      title={label}
      aria-label={label}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-card"
    >
      <Bell className="size-4" aria-hidden />
      {n > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
          {n}
        </span>
      )}
    </span>
  )
}
