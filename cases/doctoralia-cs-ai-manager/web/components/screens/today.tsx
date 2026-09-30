"use client"

import { greetingKey } from "@/components/shell/greeting"
import { Page } from "@/components/shell/page"
import { Placeholder } from "@/components/screens/placeholder"
import { useT } from "@/lib/i18n"
import { firstName, useIdentity, whoName } from "@/lib/identity"
import { useQueue } from "@/lib/queue"
import { useShell } from "@/lib/shell"

/** Hoy: the specialist's day. The layout and focus mode are phase 3; this is the frame. */
export function TodayScreen() {
  const { t, num } = useT()
  const shell = useShell()
  const { who, scope } = useIdentity()
  // A specialist sees their own day; a manager sees the day of the book they picked.
  const owner = who?.kind === "specialist" ? who.id : shell.books[scope] && /^S\d+$/.test(scope) ? scope : null
  const q = useQueue(owner)
  const name = firstName(whoName(who, shell, t("who.director")))
  const planned = q ? q.items.filter((x) => x.block === "call" || x.block === "followup" || x.block === "message").length : null
  const book = owner ? shell.books[owner] : null
  return (
    <Page
      title={name ? t(greetingKey(), { name }) : t("nav.today")}
      subtitle={book && planned != null ? t("today.subtitle", { n: num(book.active), k: planned }) : undefined}
    >
      <Placeholder phase={3}>
        <p className="text-sm text-foreground">{t("today.placeholder")}</p>
      </Placeholder>
    </Page>
  )
}
