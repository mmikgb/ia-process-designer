"use client"

import Link from "next/link"
import { useSession } from "@/lib/session"

/** Wraps a manager screen. A specialist sees a short note instead of the screen. */
export function ManagersOnly({ children }: { children: React.ReactNode }) {
  const [session] = useSession()
  if (session.role === "manager") return <>{children}</>
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
      <p className="text-base font-medium text-foreground">This screen is for managers</p>
      <p className="mt-1 text-sm text-muted-foreground">
        As a specialist you work your own book from{" "}
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          My day
        </Link>{" "}
        and{" "}
        <Link href="/conversations" className="text-primary underline-offset-4 hover:underline">
          Conversations
        </Link>
        .
      </p>
    </div>
  )
}
