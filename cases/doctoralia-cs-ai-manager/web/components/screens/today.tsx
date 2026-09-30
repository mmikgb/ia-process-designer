"use client"

import { useEffect, useState } from "react"
import { CloudOff } from "lucide-react"
import { START_EVENT } from "@/components/shell/command-palette"
import { greetingKey } from "@/components/shell/greeting"
import { Page } from "@/components/shell/page"
import { CapacityControl } from "@/components/today/capacity"
import { BriefingCard, ProgressCard, StatCards } from "@/components/today/cards"
import { FocusMode } from "@/components/today/focus"
import { Queue } from "@/components/today/queue"
import { Rail } from "@/components/today/rail"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDay } from "@/lib/day"
import { useT } from "@/lib/i18n"
import { firstName, useIdentity, whoName } from "@/lib/identity"
import { useShell } from "@/lib/shell"

/** Hoy: the specialist's day, decided in Python, cut here with their own capacity. */
export function TodayScreen() {
  const { t, num } = useT()
  const shell = useShell()
  const { who, scope } = useIdentity()
  // A specialist sees their own day; a manager sees the day of the specialist they picked.
  const owner = who?.kind === "specialist" ? who.id : /^S\d+$/.test(scope) ? scope : null
  const day = useDay(owner)
  const [focus, setFocus] = useState(false)
  const [playFilter, setPlayFilter] = useState("all")

  useEffect(() => {
    const onStart = () => setFocus(true)
    window.addEventListener(START_EVENT, onStart)
    return () => window.removeEventListener(START_EVENT, onStart)
  }, [])

  const name = firstName(whoName(who, shell, t("who.director")))
  const book = owner ? shell.books[owner] : null
  const planned = day ? day.counts.call + day.counts.followup + day.counts.message : null
  const title = name ? t(greetingKey(), { name }) : t("nav.today")
  const subtitle = book && planned != null ? t("today.subtitle", { n: num(book.active), k: planned }) : undefined

  if (!owner) {
    return (
      <Page title={title}>
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t("today.pick")}</CardContent>
        </Card>
      </Page>
    )
  }

  return (
    <Page title={title} subtitle={subtitle}>
      {!day ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-44 lg:col-span-2" />
          <Skeleton className="h-44" />
          <Skeleton className="h-64 lg:col-span-3" />
        </div>
      ) : (
        <>
          {day.local && (
            <div className="flex items-start gap-2 rounded-lg border border-chip-amber-fg/30 bg-chip-amber px-4 py-2.5 text-sm text-chip-amber-fg">
              <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">{t("today.local")}.</span> {t("today.local.body")}
              </span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <BriefingCard day={day} />
            <ProgressCard day={day} onStart={() => setFocus(true)} />
          </div>
          <StatCards
            day={day}
            onPick={(b) => {
              if (b === "message") setPlayFilter("all")
              document.getElementById(`block-${b}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
          />
          <div className="flex justify-end">
            <CapacityControl day={day} />
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Queue day={day} playFilter={playFilter} setPlayFilter={setPlayFilter} />
            <Rail day={day} />
          </div>
          <FocusMode day={day} open={focus} onOpenChange={setFocus} />
        </>
      )}
    </Page>
  )
}
