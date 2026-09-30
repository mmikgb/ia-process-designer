"use client"

// Modo ráfaga: one doctor at a time, in the day's order, with the outcome a key away.
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { AnalysisSummary } from "@/components/ai/analysis"
import { ActionPanel } from "@/components/doctor/action-panel"
import { AgreedDialog } from "@/components/today/agreed-dialog"
import { NA_REASONS, copiedDrafts, useLogOutcome } from "@/components/today/outcome-menu"
import { BLOCK } from "@/components/today/style"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { Day, LogExtra } from "@/lib/day"
import type { Outcome, Planned } from "@/lib/dayplan"
import { loadBook } from "@/lib/dossiers"
import { useT } from "@/lib/i18n"
import type { Dossier } from "@/lib/types"
import { cn } from "@/lib/utils"

export function FocusMode({ day, open, onOpenChange }: { day: Day; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, tx, num, pct, day: fmtDay } = useT()
  const logOutcome = useLogOutcome(day)
  // The walk is fixed when focus mode opens, so logging an outcome (which removes the
  // doctor from the plan) does not reshuffle what comes next.
  const [walk, setWalk] = useState<Planned[]>([])
  const [i, setI] = useState(0)
  const [book, setBook] = useState<Map<string, Dossier> | null>(null)
  const edited = useRef(false)
  const onEdited = useCallback((e: boolean) => {
    edited.current = e
  }, [])
  const [agreed, setAgreed] = useState(false)
  const [na, setNa] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (open) {
      // calls, follow-ups and messages: the day's plan. Handoffs have their bulk action.
      setWalk(day.pending.filter((y) => y.block !== "handoff"))
      setI(0)
    }
    // only when opening: the plan changes under us as outcomes are logged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) loadBook(day.owner).then(setBook).catch(() => setBook(new Map()))
  }, [open, day.owner])

  const y = walk[i] as Planned | undefined
  const doc = y && book ? (book.get(y.doctor_id) ?? null) : undefined

  useEffect(() => {
    edited.current = false
    setNa(false)
  }, [y?.doctor_id])

  const log = async (o: Outcome, extra: LogExtra = {}) => {
    if (!y || busy.current) return
    busy.current = true
    try {
      await logOutcome(y, o, { draft_edited: edited.current, ...extra })
      setI((n) => n + 1)
    } finally {
      busy.current = false
    }
  }
  const keepGoing = () => {
    const more = day.items.filter((x) => x.block === "later" && x.origin)
    setWalk((w) => [...w, ...more])
  }

  const handoff = y?.mode === "handoff"
  useEffect(() => {
    if (!open || agreed) return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)
      if (typing || e.metaKey || e.ctrlKey || e.altKey || !y) return
      const k = e.key.toLowerCase()
      const act = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (na && /^[1-4]$/.test(k)) act(() => void log("not_applicable", { reason: NA_REASONS[Number(k) - 1].split(".").pop() }))
      else if (k === "arrowright") act(() => void log("skipped"))
      else if (k === "n") act(() => setNa((v) => !v))
      else if (handoff && k === "d") act(() => void log("routed"))
      else if (!handoff && k === "e") act(() => void log("sent"))
      else if (!handoff && k === "s") act(() => void log("no_answer"))
      else if (!handoff && k === "a") act(() => setAgreed(true))
    }
    // capture: the dialog's own focus handling would otherwise take the arrow keys
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  const block = y ? BLOCK[y.block === "later" ? (y.origin ?? "later") : y.block] : null
  const done = day.done.filter((e) => e.outcome !== "skipped").length
  const moreLater = day.items.some((x) => x.block === "later" && x.origin) && walk.every((w) => w.block !== "later")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" closeLabel={t("sheet.close")} className="w-full sm:max-w-none lg:w-[min(1120px,96vw)]">
        <div className="flex items-center gap-3 border-b border-border px-6 py-4 pr-14">
          <SheetTitle className="text-base">{t("focus.title")}</SheetTitle>
          {y && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {t("focus.counter", { i: i + 1, n: walk.length })}
            </span>
          )}
          <div className="ml-auto hidden h-1.5 w-40 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${walk.length ? (Math.min(i, walk.length) / walk.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {!y ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle2 className="size-10 text-primary" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">{t("focus.done.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("focus.done.body", { n: done })}</p>
            <div className="flex gap-2">
              {moreLater && (
                <Button variant="outline" onClick={keepGoing}>
                  {t("today.keepgoing")}
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>{t("focus.exit")}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* left: who and why */}
              <section className="flex flex-col gap-5 border-border p-6 lg:border-r">
                <div className="flex items-start gap-3">
                  {block && (
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", block.chip)} aria-hidden>
                      <block.icon className="size-5" />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <h3 className="text-lg font-semibold text-foreground">{y.doctor_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[y.specialty ?? doc?.specialty, y.city ?? doc?.city, y.doctor_id].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("focus.why")}</h4>
                  <p className="text-sm font-medium text-foreground">{tx(y.reason)}</p>
                  {doc && doc.risk_reasons_i18n.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {doc.risk_reasons_i18n.map((r) => (
                        <li key={r.key}>· {tx(r.text)}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {doc === undefined ? (
                  <Skeleton className="h-24" />
                ) : doc ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Fact
                        label={t("fact.bookings")}
                        value={doc.bookings_avg != null ? num(doc.bookings_avg, 1) : "—"}
                        hint={doc.median_specialty_city != null ? t("fact.peer", { n: num(doc.median_specialty_city) }) : undefined}
                      />
                      <Fact
                        label={t("fact.calendar")}
                        value={doc.calendar_enabled ? t("fact.calendar.on", { n: doc.weekly_slots_published ?? 0 }) : t("fact.calendar.off")}
                      />
                      <Fact
                        label={t("fact.grade")}
                        value={doc.onboarding_grade ? `${doc.onboarding_grade} · ${num(doc.onboarding_score ?? 0)}` : "—"}
                      />
                      <Fact
                        label={t("fact.risk")}
                        value={pct(doc.risk_score)}
                        hint={doc.days_since_contact != null ? `${t("fact.last_contact")}: ${t("fact.days_ago", { n: doc.days_since_contact })}` : undefined}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("focus.contacts")}</h4>
                      {doc.contacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("focus.no_contacts")}</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {doc.contacts.slice(0, 3).map((c, k) => (
                            <li key={k} className="rounded-lg border border-border bg-background px-3 py-2">
                              <span className="text-xs text-muted-foreground">
                                {fmtDay(c.occurred_at)} · {c.channel} · {c.direction}
                              </span>
                              <p className="text-sm text-foreground">{c.note ?? "—"}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <AnalysisSummary doctorId={y.doctor_id} />
                  </>
                ) : null}
              </section>

              {/* right: the action */}
              <section className="p-6">
                {doc === undefined ? (
                  <Skeleton className="h-56" />
                ) : doc ? (
                  <ActionPanel
                    doc={doc}
                    onCopied={() => copiedDrafts.add(y.doctor_id)}
                    onEdited={onEdited}
                    banner={
                      y.block === "followup" && (
                        <div className="rounded-lg bg-chip-blue px-3 py-2 text-sm font-medium text-chip-blue-fg">{tx(y.reason)}</div>
                      )
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("focus.nodraft")}</p>
                )}
              </section>
            </div>

            {/* bottom: the outcome */}
            <div className="flex flex-col gap-2 border-t border-border bg-card px-6 py-3">
              {na ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{t("outcome.na")}:</span>
                  {NA_REASONS.map((r, k) => (
                    <Button key={r} size="sm" variant="outline" onClick={() => void log("not_applicable", { reason: r.split(".").pop() })}>
                      <Kbd>{k + 1}</Kbd>
                      {t(r)}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setNa(false)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {handoff ? (
                    <Button size="sm" onClick={() => void log("routed")}>
                      <Kbd className="border-white/30 bg-white/15 text-white">D</Kbd>
                      {t("outcome.routed")}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => void log("sent")}>
                        <Kbd className="border-white/30 bg-white/15 text-white">E</Kbd>
                        {t("outcome.sent")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void log("no_answer")}>
                        <Kbd>S</Kbd>
                        {t("outcome.no_answer")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAgreed(true)}>
                        <Kbd>A</Kbd>
                        {t("outcome.agreed")}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setNa(true)}>
                    <Kbd>N</Kbd>
                    {t("outcome.na")}
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void log("skipped")}>
                    {t("outcome.skip")}
                    <ArrowRight />
                  </Button>
                </div>
              )}
              <p className="hidden text-xs text-muted-foreground sm:block">{handoff ? t("focus.keys.handoff") : t("focus.keys")}</p>
            </div>
            <AgreedDialog
              open={agreed}
              onOpenChange={setAgreed}
              today={day.today}
              name={y.doctor_name}
              onSave={(next_due, note) => {
                setAgreed(false)
                void log("agreed", { next_due, note: note || null })
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}
