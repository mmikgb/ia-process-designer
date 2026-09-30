"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { ChevronsUpDown, Moon, Sparkles, Stethoscope, Sun } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { useT } from "@/lib/i18n"
import { useIdentity, whoName } from "@/lib/identity"
import { navGroups } from "@/lib/nav"
import { useShell } from "@/lib/shell"
import { cn } from "@/lib/utils"

export const ASK_EVENT = "cs:ask"

/**
 * The sidebar's content. `compact` is decided by CSS (icons only between md and lg),
 * so the same markup serves the desktop rail and the mobile sheet.
 */
export function SidebarContent({ onNavigate, mobile = false }: { onNavigate?: () => void; mobile?: boolean }) {
  const { t } = useT()
  const { who } = useIdentity()
  const path = usePathname()
  // In the mobile sheet everything is full width; on the rail, labels hide below lg.
  const label = mobile ? "" : "hidden lg:inline"
  const full = mobile ? "flex" : "hidden lg:flex"
  const only = mobile ? "hidden" : "flex lg:hidden"

  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div className={cn("flex items-center gap-2 px-2", !mobile && "justify-center lg:justify-start")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Stethoscope className="size-4" aria-hidden />
        </span>
        <span className={cn("text-[15px] font-semibold tracking-tight text-foreground", label)}>{t("app.name")}</span>
      </div>

      <div className={full}>
        <ContextSwitcher />
      </div>

      <nav aria-label={t("nav.menu")} className="flex flex-col gap-3">
        {navGroups(who?.kind ?? null).map((group, gi) => (
          <div key={gi} className={cn("flex flex-col gap-0.5", gi > 0 && "border-t border-border pt-3")}>
            <span className={cn("px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase", label)}>
              {t(group[0].group === "work" ? "nav.group.work" : "nav.group.manage")}
            </span>
            {group.map((item) => {
              const on = path === item.href || path.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  title={t(item.label)}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    !mobile && "justify-center lg:justify-start",
                    on
                      ? "border-border bg-card font-medium text-foreground shadow-card"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className={label}>{t(item.label)}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <AssistantCard className={full} />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}
          title={t("ai.ask")}
          className={cn(
            "size-9 items-center justify-center self-center rounded-lg bg-primary text-primary-foreground",
            only,
          )}
        >
          <Sparkles className="size-4" aria-hidden />
          <span className="sr-only">{t("ai.ask")}</span>
        </button>
        <StatusRow compact={!mobile} />
        <UserCard compact={!mobile} />
      </div>
    </div>
  )
}

function AssistantCard({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <div
      className={cn(
        "flex-col gap-2 rounded-lg bg-linear-to-br from-[#006a59] to-[#00806a] p-4 text-white shadow-card",
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-white/15">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <p className="text-sm leading-snug font-semibold">{t("ai.ask")}</p>
      <p className="text-xs leading-snug text-white/85">{t("assistant.body")}</p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(ASK_EVENT))}
        className="mt-1 flex h-8 items-center justify-center gap-2 rounded-lg bg-white text-sm font-medium text-[#006a59] transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        {t("assistant.cta")}
        <Kbd className="border-[#006a59]/20 bg-[#006a59]/10 text-[#006a59]">⌘J</Kbd>
      </button>
    </div>
  )
}

function StatusRow({ compact }: { compact: boolean }) {
  const { t, locale, setLocale } = useT()
  const shell = useShell()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === "dark"
  return (
    <div className={cn("flex flex-col gap-2 px-1", compact && "items-center lg:items-stretch")}>
      <span className={cn("items-center gap-2 text-xs text-muted-foreground", compact ? "hidden lg:flex" : "flex")}>
        <span
          className={cn("size-2 rounded-full", shell.ai.enabled ? "bg-primary" : "bg-muted-foreground/50")}
          aria-hidden
        />
        {shell.ai.enabled ? t("ai.on", { models: "Haiku/Sonnet" }) : t("ai.off.short")}
      </span>
      <div className={cn("flex items-center gap-2", compact && "flex-col lg:flex-row")}>
        <div role="radiogroup" aria-label={t("lang.label")} className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={locale === l}
              onClick={() => setLocale(l)}
              className={cn(
                "h-7 rounded-md px-2 text-xs font-semibold uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`${t("theme.label")}: ${dark ? t("theme.dark") : t("theme.light")}`}
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? <Sun /> : <Moon />}
        </Button>
      </div>
    </div>
  )
}

function UserCard({ compact }: { compact: boolean }) {
  const { t } = useT()
  const shell = useShell()
  const { who, setPickerOpen } = useIdentity()
  const name = whoName(who, shell, t("who.director"))
  const role = !who
    ? ""
    : who.kind === "specialist"
      ? t("who.specialist", { team: shell.specialists.find((s) => s.id === who.id)?.team.replace("Farming ", "") ?? "" })
      : who.kind === "manager"
        ? t("who.manager", { team: who.team.replace("Farming ", "") })
        : t("who.role.director")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-left shadow-card transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          compact && "justify-center lg:justify-start",
        )}
      >
        <Avatar name={name || "?"} />
        <span className={cn("min-w-0 flex-1 flex-col", compact ? "hidden lg:flex" : "flex")}>
          <span className="truncate text-sm font-medium text-foreground">{name ? name.split(/\s+/).slice(0, 2).join(" ") : t("user.none")}</span>
          <span className="truncate text-xs text-muted-foreground">{role}</span>
        </span>
        <ChevronsUpDown className={cn("size-4 text-muted-foreground", compact && "hidden lg:block")} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuItem onClick={() => setPickerOpen(true)}>{t("user.switch")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ContextSwitcher() {
  const { t, num } = useT()
  const shell = useShell()
  const { who, scope, setScope } = useIdentity()
  if (!who) return null
  const book = shell.books[scope]
  const label =
    scope === "all"
      ? t("context.portfolio")
      : scope.startsWith("team:")
        ? scope.slice(5)
        : who.kind === "specialist"
          ? t("context.book")
          : (shell.specialists.find((s) => s.id === scope)?.name ?? scope)
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        {book && <span className="text-xs text-muted-foreground">{t("context.doctors", { n: num(book.active) })}</span>}
      </span>
    </>
  )
  const box = "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-card"
  if (who.kind === "specialist") return <div className={box}>{body}</div>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("context.label")}
        className={cn(box, "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
      >
        {body}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 min-w-60">
        <DropdownMenuCheckItem checked={scope === "all"} onClick={() => setScope("all")}>
          {t("context.portfolio")}
        </DropdownMenuCheckItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("context.teams")}</DropdownMenuLabel>
          {shell.teams.map((team) => (
            <DropdownMenuCheckItem key={team} checked={scope === `team:${team}`} onClick={() => setScope(`team:${team}`)}>
              {team}
            </DropdownMenuCheckItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("context.specialists")}</DropdownMenuLabel>
          {shell.specialists.map((s) => (
            <DropdownMenuCheckItem key={s.id} checked={scope === s.id} onClick={() => setScope(s.id)}>
              {s.name}
            </DropdownMenuCheckItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
