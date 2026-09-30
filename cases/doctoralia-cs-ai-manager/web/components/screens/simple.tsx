"use client"

import { Page } from "@/components/shell/page"
import { Placeholder } from "@/components/screens/placeholder"
import { useT } from "@/lib/i18n"
import type { Key } from "@/lib/i18n/es"

/** A screen whose content arrives in a later phase: title, subtitle, a note. */
export function SimpleScreen({ title, subtitle, phase }: { title: Key; subtitle: Key; phase: number }) {
  const { t } = useT()
  return (
    <Page title={t(title)} subtitle={t(subtitle)}>
      <Placeholder phase={phase} />
    </Page>
  )
}

/** A screen that already exists, in the new frame. */
export function Framed({ title, subtitle, children }: { title: Key; subtitle: Key; children: React.ReactNode }) {
  const { t } = useT()
  return (
    <Page title={t(title)} subtitle={t(subtitle)}>
      {children}
    </Page>
  )
}
