"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { ASK_EVENT, SidebarContent } from "@/components/shell/sidebar"
import { WhoDialog } from "@/components/shell/who-dialog"
import { CommandPalette } from "@/components/shell/command-palette"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useT } from "@/lib/i18n"
import { ClockProvider } from "@/lib/clock"
import { IdentityProvider } from "@/lib/identity"
import { ShellDataProvider, type ShellData } from "@/lib/shell"

/** The frame every screen shares: sidebar, identity, and the global shortcuts. */
export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  return (
    <ShellDataProvider value={data}>
      <IdentityProvider>
        <ClockProvider>
        <TooltipProvider>
          <div className="flex min-h-dvh bg-background">
            <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar md:block lg:w-[248px]">
              <SidebarContent />
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
          <WhoDialog />
          <CommandPalette />
          <ShellEvents />
          <Toaster position="bottom-right" />
        </TooltipProvider>
        </ClockProvider>
      </IdentityProvider>
    </ShellDataProvider>
  )
}

/** ⌘J / Ctrl+J opens the assistant. Until phase 4 it says where it is coming. */
function ShellEvents() {
  const { t } = useT()
  useEffect(() => {
    const onAsk = () => toast(t("ai.ask"), { description: t("assistant.soon") })
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        window.dispatchEvent(new Event(ASK_EVENT))
      }
    }
    window.addEventListener(ASK_EVENT, onAsk)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener(ASK_EVENT, onAsk)
      window.removeEventListener("keydown", onKey)
    }
  }, [t])
  return null
}
