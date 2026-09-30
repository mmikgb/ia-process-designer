"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Page } from "@/components/shell/page"
import { useT } from "@/lib/i18n"
import { homePath, useIdentity } from "@/lib/identity"

/** "/" sends a specialist to their day and a manager to the summary. */
export function Home() {
  const { t } = useT()
  const router = useRouter()
  const { who, ready } = useIdentity()
  useEffect(() => {
    if (ready && who) router.replace(homePath(who))
  }, [ready, who, router])
  return <Page title={t("app.name")} subtitle={t("who.body")} />
}
