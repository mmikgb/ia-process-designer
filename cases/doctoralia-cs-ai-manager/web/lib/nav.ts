import {
  Activity,
  CalendarCheck,
  ChartSpline,
  Coins,
  LayoutDashboard,
  Radar,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import type { Key } from "@/lib/i18n/es"
import type { Role } from "@/lib/identity"

export interface NavItem {
  href: string
  label: Key
  icon: LucideIcon
  group: "work" | "manage"
}

export const NAV: NavItem[] = [
  { href: "/hoy", label: "nav.today", icon: CalendarCheck, group: "work" },
  { href: "/doctores", label: "nav.doctors", icon: Users, group: "work" },
  { href: "/senales", label: "nav.signals", icon: Radar, group: "work" },
  { href: "/resumen", label: "nav.summary", icon: LayoutDashboard, group: "manage" },
  { href: "/equipo", label: "nav.team", icon: UsersRound, group: "manage" },
  { href: "/pulse", label: "nav.pulse", icon: Activity, group: "manage" },
  { href: "/control", label: "nav.control", icon: ChartSpline, group: "manage" },
  { href: "/costo", label: "nav.cost", icon: Coins, group: "manage" },
]

/** A specialist sees their work first; a manager or director sees management first. */
export function navGroups(role: Role | null): NavItem[][] {
  const work = NAV.filter((n) => n.group === "work")
  const manage = NAV.filter((n) => n.group === "manage")
  return role === "specialist" || role === null ? [work, manage] : [manage, work]
}
