"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "@/lib/session"
import type { Specialist } from "@/lib/types"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/", label: "Overview", specialistLabel: "My day", hint: "Where to act", who: "all" },
  { href: "/conversations", label: "Conversations", hint: "Every contact, as a chat", who: "all" },
  { href: "/team", label: "My team", hint: "Where is the work, who needs help?", who: "manager" },
  { href: "/pulse", label: "Pulse", hint: "What has been happening day by day?", who: "manager" },
  { href: "/control", label: "Control", hint: "Real change or noise?", who: "manager" },
  { href: "/cost", label: "Cost", hint: "What does the AI cost?", who: "manager" },
] as const

export function SiteNav() {
  const path = usePathname()
  const [session] = useSession()
  const links = LINKS.filter((l) => l.who === "all" || session.role === "manager")
  return (
    <nav aria-label="Screens" className="flex flex-wrap gap-1">
      {links.map((l) => {
        const on = l.href === "/" ? path === "/" : path.startsWith(l.href)
        const label = session.role === "specialist" && "specialistLabel" in l ? l.specialistLabel : l.label
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            title={l.hint}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Who is looking. A demo switch, not a login: it decides what is shown. */
export function SessionSwitch({ specialists }: { specialists: Specialist[] }) {
  const [session, setSession] = useSession()
  const value = session.role === "manager" ? "manager" : (session.me ?? "manager")
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Viewing as
      <select
        value={value}
        onChange={(e) =>
          setSession(
            e.target.value === "manager"
              ? { role: "manager", me: null }
              : { role: "specialist", me: e.target.value },
          )
        }
        className="h-8 max-w-[14rem] rounded-lg border border-input bg-background px-2 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="manager">Manager · all teams</option>
        <optgroup label="Specialist">
          {specialists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.team.replace("Farming ", "")}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  )
}
