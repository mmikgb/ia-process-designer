"use client"

import { Suspense } from "react"
import { Page } from "@/components/shell/page"
import { WeekCard } from "@/components/ai/week"
import { Dashboard } from "@/components/overview/dashboard"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { useShell } from "@/lib/shell"
import type { OverviewData } from "@/lib/types"

/** Resumen: the manager's overview. Restyled in phase 5 (T5.3); here it moves into the frame. */
export function SummaryScreen({ data }: { data: OverviewData }) {
  const { t, num } = useT()
  const shell = useShell()
  const { scope } = useIdentity()
  const book = shell.books[scope] ?? shell.books.all
  const label =
    scope === "all"
      ? t("context.portfolio")
      : scope.startsWith("team:")
        ? scope.slice(5)
        : (shell.specialists.find((s) => s.id === scope)?.name ?? scope)
  return (
    <Page
      title={t("nav.summary")}
      subtitle={t("summary.subtitle", { scope: label, n: num(book.active), risk: num(book.atRisk), days: 30 })}
    >
      <WeekCard />
      <Suspense fallback={null}>
        <Dashboard data={data} />
      </Suspense>
    </Page>
  )
}
