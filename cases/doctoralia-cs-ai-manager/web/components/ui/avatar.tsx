import { cn } from "@/lib/utils"

/** Initials only: the app shows no photos of people. */
function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
  return (
    <span
      data-slot="avatar"
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-chip-green text-xs font-semibold text-chip-green-fg",
        className,
      )}
    >
      {initials}
    </span>
  )
}

export { Avatar }
