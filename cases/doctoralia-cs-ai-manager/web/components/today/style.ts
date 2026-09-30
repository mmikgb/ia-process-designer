import { CalendarClock, Clock3, MessageSquare, PhoneCall, Route, type LucideIcon } from "lucide-react"
import type { Block } from "@/lib/dayplan"
import type { Key } from "@/lib/i18n/es"

/** One look per block: call = red, follow-up = blue, message = green, handoff = violet. */
export const BLOCK: Record<Block, { icon: LucideIcon; chip: string; label: Key; what: Key }> = {
  call: { icon: PhoneCall, chip: "bg-chip-red text-chip-red-fg", label: "block.call", what: "today.what.call" },
  followup: { icon: CalendarClock, chip: "bg-chip-blue text-chip-blue-fg", label: "block.followup", what: "today.what.followup" },
  message: { icon: MessageSquare, chip: "bg-chip-green text-chip-green-fg", label: "block.message", what: "today.what.message" },
  handoff: { icon: Route, chip: "bg-chip-violet text-chip-violet-fg", label: "block.handoff", what: "today.what.handoff" },
  later: { icon: Clock3, chip: "bg-muted text-muted-foreground", label: "block.later", what: "today.what.message" },
}
