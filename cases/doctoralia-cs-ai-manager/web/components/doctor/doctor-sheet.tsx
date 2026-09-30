"use client"

// The doctor sheet, v2: one sheet for every list (?doctor=ID). Tabs: Resumen,
// Acción, Análisis IA (phase 4), Historial. Outcomes from the header.
import { useEffect, useMemo, useState } from "react"
import { CalendarClock } from "lucide-react"
import { ActionPanel } from "@/components/doctor/action-panel"
import { OutcomeMenu, copiedDrafts } from "@/components/today/outcome-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useClock } from "@/lib/clock"
import { useLogFor } from "@/lib/day"
import { loadDossier } from "@/lib/dossiers"
import { useT } from "@/lib/i18n"
import type { Key } from "@/lib/i18n/es"
import { useIdentity } from "@/lib/identity"
import { useShell } from "@/lib/shell"
import type { Dossier, Flag } from "@/lib/types"
import { cn } from "@/lib/utils"

export function DoctorSheet({ target, onClose }: { target: { id: string; owner: string } | null; onClose: () => void }) {
  const { t, pct } = useT()
  const shell = useShell()
  const clock = useClock()
  const [doc, setDoc] = useState<Dossier | null | undefined>(undefined)
  const [tab, setTab] = useState("summary")
  const log = useLogFor(target?.owner || null)

  useEffect(() => {
    let live = true
    setDoc(undefined)
    setTab("summary")
    if (!target) return
    if (!target.owner) {
      setDoc(null)
      return
    }
    loadDossier(target.owner, target.id)
      .then((d) => live && setDoc(d))
      .catch(() => live && setDoc(null))
    return () => {
      live = false
    }
  }, [target])

  const owner = doc ? (shell.specialists.find((s) => s.id === doc.owner_specialist_id)?.name ?? doc.owner_specialist_id) : ""
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" closeLabel={t("sheet.close")} className="sm:max-w-2xl">
        <header className="flex flex-col gap-3 border-b border-border px-6 py-5 pr-14">
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="truncate">{doc?.doctor_name ?? (doc === null ? target?.id : t("sheet.loading"))}</SheetTitle>
            {doc && (
              <SheetDescription>
                {doc.specialty} · {doc.city} · {doc.doctor_id} · {t("sheet.owner", { name: owner })}
              </SheetDescription>
            )}
          </div>
          {doc && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  doc.status === "active" ? "bg-chip-green text-chip-green-fg" : "bg-chip-red text-chip-red-fg",
                )}
              >
                {t(doc.status === "active" ? "sheet.status.active" : "sheet.status.churned")}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
                  doc.risk_score >= 0.5 ? "bg-chip-red text-chip-red-fg" : doc.risk_score >= 0.3 ? "bg-chip-amber text-chip-amber-fg" : "bg-muted text-muted-foreground",
                )}
              >
                {t("sheet.risk", { p: pct(doc.risk_score) })}
              </span>
              {doc.status === "active" && (
                <OutcomeMenu
                  day={{ log }}
                  today={clock.today}
                  target={{ doctor_id: doc.doctor_id, doctor_name: doc.doctor_name, play: doc.copilot.play, mode: doc.copilot.mode }}
                  className="ml-auto h-7"
                />
              )}
            </div>
          )}
        </header>

        {doc === undefined ? (
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : doc === null ? (
          <p className="m-6 rounded-lg bg-chip-red px-3 py-2 text-sm text-chip-red-fg">{t("sheet.missing")}</p>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col">
            <div className="overflow-x-auto px-6 pt-4">
              <TabsList>
                <TabsTrigger value="summary">{t("sheet.tab.summary")}</TabsTrigger>
                <TabsTrigger value="action">{t("sheet.tab.action")}</TabsTrigger>
                <TabsTrigger value="ai">{t("sheet.tab.ai")}</TabsTrigger>
                <TabsTrigger value="history">{t("sheet.tab.history")}</TabsTrigger>
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <TabsContent value="summary">
                <SummaryTab doc={doc} />
              </TabsContent>
              <TabsContent value="action" className="flex flex-col gap-4">
                <ActionPanel doc={doc} onCopied={() => copiedDrafts.add(doc.doctor_id)} />
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{t("sheet.writer.soon")}</p>
              </TabsContent>
              <TabsContent value="ai">
                <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t("sheet.ai.soon")}</p>
              </TabsContent>
              <TabsContent value="history">
                <HistoryTab doc={doc} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

const FLAG_LABEL: Record<Flag, Key> = {
  at_risk: "flag.at_risk",
  may_cancel: "flag.may_cancel",
  discouraged: "flag.discouraged",
  hollow: "flag.hollow",
  not_found: "flag.not_found",
  commitment: "flag.commitment",
  followup_due: "flag.followup_due",
  calendar_off: "flag.calendar_off",
  grade_d: "flag.grade_d",
  upsell: "flag.upsell",
}

function SummaryTab({ doc }: { doc: Dossier }) {
  const { t, tx, num, pct, day } = useT()
  const shell = useShell()
  const { who } = useIdentity()
  const f = doc.followup
  const mine = !!f && who?.kind === "specialist" && f.set_by === who.id
  const setBy = f ? (shell.specialists.find((s) => s.id === f.set_by)?.name.split(" ")[0] ?? f.set_by) : ""
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("sheet.why")}</h3>
        {doc.risk_reasons_i18n.length ? (
          <ul className="flex flex-col gap-1 text-sm text-foreground">
            {doc.risk_reasons_i18n.map((r) => (
              <li key={r.key}>· {tx(r.text)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("sheet.nosignal")}</p>
        )}
        {doc.top_signal_note && doc.top_signal_at && (
          <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-foreground italic">
            &ldquo;{doc.top_signal_note}&rdquo;
            <span className="block text-xs text-muted-foreground not-italic">{t("sheet.quote", { date: day(doc.top_signal_at) })}</span>
          </blockquote>
        )}
      </section>

      {doc.flags.length > 0 && (
        <section className="flex flex-wrap gap-1.5" aria-label={t("sheet.flags")}>
          {doc.flags.map((fl) => (
            <span key={fl} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {t(FLAG_LABEL[fl])}
            </span>
          ))}
        </section>
      )}

      {f && (
        <section className="flex items-start gap-3 rounded-lg bg-chip-blue px-4 py-3 text-chip-blue-fg">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">
              {t("sheet.followup")}: {mine ? t("sheet.followup.mine", { date: day(f.due_at) }) : t("sheet.followup.text", { who: setBy, date: day(f.due_at) })}
            </span>
            <span className="text-xs opacity-90">&ldquo;{f.note}&rdquo; · {day(f.set_at)}</span>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Fact label={t("fact.bookings")} value={doc.bookings_avg != null ? num(doc.bookings_avg, 1) : "—"}
          hint={doc.median_specialty_city != null ? t("fact.peer", { n: num(doc.median_specialty_city) }) : undefined} />
        <Fact label={t("fact.calendar")} value={doc.calendar_enabled ? t("fact.calendar.on", { n: doc.weekly_slots_published ?? 0 }) : t("fact.calendar.off")} />
        <Fact label={t("fact.grade")} value={doc.onboarding_grade ? `${doc.onboarding_grade} · ${num(doc.onboarding_score ?? 0)}` : "—"} />
        <Fact label={t("fact.risk")} value={pct(doc.risk_score)} />
        <Fact label={t("fact.last_contact")} value={doc.days_since_contact != null ? t("fact.days_ago", { n: doc.days_since_contact }) : "—"} />
        <Fact label={t("sheet.signup")} value={doc.signup_date ? day(doc.signup_date) : "—"} />
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{t("sheet.bookings")}</h3>
        <p className="text-xs text-muted-foreground">{t("sheet.bookings.note")}</p>
        <MonthlyDots rows={doc.bookings} peer={doc.median_specialty_city} />
      </section>
    </div>
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

/** Monthly points, drawn as points: five points are not a trend line. */
function MonthlyDots({ rows, peer }: { rows: Dossier["bookings"]; peer: number | null }) {
  const { t, locale, num } = useT()
  if (!rows.length) return <p className="text-sm text-muted-foreground">—</p>
  const max = Math.max(...rows.map((r) => r.patient_bookings), peer ?? 0, 1)
  const W = 320
  const H = 84
  const x = (i: number) => (rows.length === 1 ? W / 2 : 20 + (i * (W - 40)) / (rows.length - 1))
  const y = (v: number) => H - 16 - (v / max) * (H - 32)
  const month = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { month: "short" })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full max-w-md" role="img" aria-label={t("sheet.bookings")}>
      {peer != null && (
        <>
          <line x1={8} x2={W - 8} y1={y(peer)} y2={y(peer)} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" strokeWidth={1} />
          <text x={W - 8} y={y(peer) - 4} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">
            {t("sheet.peer", { n: num(peer, 1) })}
          </text>
        </>
      )}
      {rows.map((r, i) => (
        <g key={r.month}>
          <circle cx={x(i)} cy={y(r.patient_bookings)} r={4} fill="var(--color-chart-1)" stroke="var(--color-card)" strokeWidth={2} />
          <text x={x(i)} y={y(r.patient_bookings) - 8} textAnchor="middle" fontSize={10} fill="var(--color-foreground)">
            {r.patient_bookings}
          </text>
          <text x={x(i)} y={H - 2} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
            {month.format(new Date(`${r.month}-15T12:00:00`)).replace(".", "")}
          </text>
        </g>
      ))}
    </svg>
  )
}

type Kind = "contact" | "campaign" | "escalation" | "milestone"
interface Ev {
  at: string
  kind: Kind
  title: string
  body?: string | null
}

function HistoryTab({ doc }: { doc: Dossier }) {
  const { t, day } = useT()
  const shell = useShell()
  const [kind, setKind] = useState<Kind | "all">("all")
  const events = useMemo(() => {
    const who = (id: string) => shell.specialists.find((s) => s.id === id)?.name.split(" ")[0] ?? id
    const out: Ev[] = []
    for (const c of doc.contacts_all ?? doc.contacts)
      out.push({ at: c.occurred_at, kind: "contact", title: `${c.channel} · ${c.direction} · ${who(c.specialist_id)}`, body: c.note })
    for (const c of doc.campaigns)
      out.push({
        at: c.enrolled_at,
        kind: "campaign",
        title: t("hist.enrolled", { id: c.campaign_id, name: c.name ?? "" }),
        body: [
          t(c.engaged ? "hist.engaged" : "hist.not_engaged"),
          // null means nobody recorded an outcome: never shown as "no"
          c.converted == null ? t("hist.no_outcome") : t(c.converted ? "hist.converted" : "hist.not_converted"),
        ].join(" · "),
      })
    for (const e of doc.escalations)
      out.push({
        at: e.escalated_at,
        kind: "escalation",
        title: t("hist.escalated", { m: e.minutes_to_pickup, who: who(e.handler) }),
        body: t(e.converted ? "hist.converted" : "hist.not_converted"),
      })
    if (doc.signup_date) out.push({ at: doc.signup_date, kind: "milestone", title: t("hist.signup") })
    if (doc.onboarding_closed_at)
      out.push({ at: doc.onboarding_closed_at, kind: "milestone", title: t("hist.onboarding", { g: doc.onboarding_grade ?? "—" }) })
    if (doc.calendar_enabled_at) out.push({ at: doc.calendar_enabled_at, kind: "milestone", title: t("hist.calendar") })
    if (doc.churned_at) out.push({ at: doc.churned_at, kind: "milestone", title: t("hist.churned") })
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  }, [doc, t, shell.specialists])
  const shown = kind === "all" ? events : events.filter((e) => e.kind === kind)
  const KINDS: { k: Kind | "all"; label: Key }[] = [
    { k: "all", label: "hist.all" },
    { k: "contact", label: "hist.contact" },
    { k: "campaign", label: "hist.campaign" },
    { k: "escalation", label: "hist.escalation" },
    { k: "milestone", label: "hist.milestone" },
  ]
  const DOT: Record<Kind, string> = {
    contact: "bg-chip-blue-fg",
    campaign: "bg-chip-violet-fg",
    escalation: "bg-chip-red-fg",
    milestone: "bg-chip-green-fg",
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t("sheet.tab.history")} className="flex flex-wrap gap-1.5">
        {KINDS.map(({ k, label }) => {
          const n = k === "all" ? events.length : events.filter((e) => e.kind === k).length
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-7 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                kind === k ? "border-primary bg-chip-green text-chip-green-fg" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {t(label)} · {n}
            </button>
          )
        })}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hist.empty")}</p>
      ) : (
        <ol className="relative flex flex-col gap-3 border-l border-border pl-5">
          {shown.map((e, i) => (
            <li key={i} className="relative">
              <span className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card", DOT[e.kind])} aria-hidden />
              <div className="text-xs text-muted-foreground">
                {day(e.at)} {e.at.slice(0, 4)} · {e.title}
              </div>
              {e.body && <p className="text-sm text-foreground">{e.body}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
