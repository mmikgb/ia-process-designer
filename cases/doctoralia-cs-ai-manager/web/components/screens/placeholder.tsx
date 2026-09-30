"use client"

import { Card, CardContent } from "@/components/ui/card"
import { useT } from "@/lib/i18n"

/** A screen that a later phase of the plan fills in. */
export function Placeholder({ phase, children }: { phase: number; children?: React.ReactNode }) {
  const { t } = useT()
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        {children}
        <p className="text-sm text-muted-foreground">{t("page.soon", { n: phase })}</p>
      </CardContent>
    </Card>
  )
}
