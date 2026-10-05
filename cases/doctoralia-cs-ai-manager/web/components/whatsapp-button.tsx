"use client"

import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Opens WhatsApp (app or web) with the message already written. The specialist
 * picks the chat and presses send: the tool never sends on its own, and the
 * dataset has no phone numbers, so there is nothing to send to automatically.
 */
export function WhatsAppButton({
  text,
  onOpened,
  size = "sm",
  className,
}: {
  text: string
  onOpened?: () => void
  size?: "sm" | "md"
  className?: string
}) {
  const disabled = !text.trim()
  return (
    <a
      href={disabled ? undefined : `https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) return e.preventDefault()
        onOpened?.()
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium text-white transition-colors",
        "bg-[#1a7f45] hover:bg-[#166b3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-4 text-sm",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <MessageCircle className="size-3.5" aria-hidden />
      Send on WhatsApp
    </a>
  )
}
