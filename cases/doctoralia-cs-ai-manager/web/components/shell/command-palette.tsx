"use client"

import { Command } from "cmdk"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { CalendarCheck, Languages, Moon, Search, Sparkles, UserRound } from "lucide-react"
import { ASK_EVENT } from "@/components/shell/sidebar"
import { PALETTE_EVENT } from "@/components/shell/top-bar"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { NAV } from "@/lib/nav"
import { fold, loadSearch, matchDoctors } from "@/lib/search"
import { useShell } from "@/lib/shell"
import type { SearchRow } from "@/lib/types"

export const START_EVENT = "cs:start"

const item =
  "flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
const group =
  "px-1 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"

/** ⌘K: doctors by name, id, specialty or city; the screens; a few actions. */
export function CommandPalette() {
  const { t, tx, locale, setLocale, pct } = useT()
  const shell = useShell()
  const router = useRouter()
  const path = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const { who, setPickerOpen } = useIdentity()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<SearchRow[] | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(PALETTE_EVENT, onOpen)
    }
  }, [])

  // Lazy: the index is only fetched the first time the palette opens.
  useEffect(() => {
    if (open && !rows) loadSearch().then(setRows).catch(() => setRows([]))
    if (!open) setQuery("")
  }, [open, rows])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }
  const owner = who?.kind === "specialist" ? who.id : null
  const doctors = rows ? matchDoctors(rows, query, owner) : []
  const ownerName = (id: string) => shell.specialists.find((s) => s.id === id)?.name ?? id
  const q = fold(query)
  const screens = NAV.filter((n) => !q || fold(t(n.label)).includes(q))
  const actions = [
    { key: "start", label: t("palette.start"), icon: CalendarCheck, fn: () => {
      router.push("/hoy")
      window.dispatchEvent(new Event(START_EVENT))
    } },
    { key: "ask", label: t("palette.ask"), icon: Sparkles, fn: () => window.dispatchEvent(new Event(ASK_EVENT)) },
    { key: "lang", label: `${t("palette.lang")} (${locale === "es" ? "EN" : "ES"})`, icon: Languages, fn: () => setLocale(locale === "es" ? "en" : "es") },
    { key: "theme", label: t("palette.theme"), icon: Moon, fn: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
    { key: "who", label: t("palette.who"), icon: UserRound, fn: () => setPickerOpen(true) },
  ].filter((a) => !q || fold(a.label).includes(q))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t("search.open")}</DialogTitle>
        <Command shouldFilter={false} label={t("search.open")} className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("palette.placeholder")}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1">
            {query && rows === null && <Command.Loading className="px-3 py-2 text-sm text-muted-foreground">{t("palette.loading")}</Command.Loading>}
            {query && rows !== null && !doctors.length && !screens.length && !actions.length && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("palette.empty")}</div>
            )}
            {doctors.length > 0 && (
              <Command.Group heading={t("palette.doctors")} className={group}>
                {doctors.map((d) => (
                  <Command.Item
                    key={d.id}
                    value={`doctor:${d.id}`}
                    onSelect={() => run(() => router.push(`${path}?doctor=${d.id}`, { scroll: false }))}
                    className={item}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-foreground">
                        {d.name}
                        {d.status !== "active" && (
                          <span className="ml-2 rounded bg-chip-red px-1.5 py-0.5 text-[11px] font-medium text-chip-red-fg">{t("palette.churned")}</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {d.specialty} · {d.city} · {d.id} · {ownerName(d.owner)}
                        {d.play && ` · ${tx(shell.plays.find((p) => p.key === d.play)?.label ?? d.play)}`}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{pct(d.risk)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {screens.length > 0 && (
              <Command.Group heading={t("palette.screens")} className={group}>
                {screens.map((n) => {
                  const Icon = n.icon
                  return (
                    <Command.Item key={n.href} value={`screen:${n.href}`} onSelect={() => run(() => router.push(n.href))} className={item}>
                      <Icon aria-hidden />
                      {t(n.label)}
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}
            {actions.length > 0 && (
              <Command.Group heading={t("palette.actions")} className={group}>
                {actions.map((a) => {
                  const Icon = a.icon
                  return (
                    <Command.Item key={a.key} value={`action:${a.key}`} onSelect={() => run(a.fn)} className={item}>
                      <Icon aria-hidden />
                      {a.label}
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
