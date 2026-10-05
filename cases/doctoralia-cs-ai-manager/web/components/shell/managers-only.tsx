"use client"

// Team performance, the operation's charts and the AI budget are for managers and the
// director. A specialist who lands here (an old link, a typed URL) is sent back to their day.
import Link from "next/link"
import { Lock } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"

export function ManagersOnly({ children }: { children: React.ReactNode }) {
  const { t } = useT()
  const { who, ready } = useIdentity()
  if (ready && who?.kind === "specialist")
    return (
      <Card className="items-center gap-3 py-12 text-center" data-testid="managers-only">
        <Lock className="size-6 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">{t("managers_only.body")}</p>
        <Link href="/hoy" className={buttonVariants({ size: "sm" })}>
          {t("managers_only.back")}
        </Link>
      </Card>
    )
  return <>{children}</>
}
