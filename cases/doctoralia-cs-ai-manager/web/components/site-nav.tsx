"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/", label: "Overview", hint: "Where to act" },
  { href: "/control", label: "Control", hint: "Real change or noise?" },
]

export function SiteNav() {
  const path = usePathname()
  return (
    <nav aria-label="Screens" className="flex gap-1">
      {LINKS.map((l) => {
        const on = l.href === "/" ? path === "/" : path.startsWith(l.href)
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
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
