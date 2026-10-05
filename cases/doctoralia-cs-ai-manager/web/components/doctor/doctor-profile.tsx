"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Check, Copy, PhoneCall, Search } from "lucide-react"
import { Fact, MonthlyDots } from "@/components/doctor/doctor-panel"
import { RiskExplainer } from "@/components/risk-explainer"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import { SIGNAL_LABEL, loadHandled, saveHandled, type Handled } from "@/lib/controls"
import { MISSING_FILES, loadChats, loadDossier, loadIndex } from "@/lib/dossiers"
import { useSession } from "@/lib/session"
import type { ChatRow, DoctorIndex, Dossier, OverviewData } from "@/lib/types"

const yes = (v: boolean | null | undefined) => (v == null ? "—" : v ? "Yes" : "No")
const num = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toFixed(d))
const date = (v: string | null | undefined) => (v ? v.slice(0, 10) : "—")

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Finder shown when no doctor is selected, or the one asked for is not visible to this person. */
function Finder({ index, allowed, message }: { index: DoctorIndex | null; allowed: (owner: string) => boolean; message?: string }) {
  const [q, setQ] = useState("")
  const hits = useMemo(() => {
    if (!index || q.trim().length < 2) return []
    const t = q.trim().toLowerCase()
    return Object.entries(index)
      .filter(([id, v]) => allowed(v[0]) && `${id} ${v[1]} ${v[2]} ${v[3]}`.toLowerCase().includes(t))
      .slice(0, 20)
  }, [index, q, allowed])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Find a doctor</CardTitle>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, specialty, city or ID"
            aria-label="Find a doctor"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <ul className="flex flex-col">
          {hits.map(([id, [, name, specialty, city, status]]) => (
            <li key={id}>
              <Link href={`/doctor?id=${id}`} className="flex gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                <span className="font-medium text-primary">{name}</span>
                <span className="text-muted-foreground">
                  {specialty} · {city} · {id}
                  {status !== "active" && ` · ${status}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function DoctorProfile({ data }: { data: OverviewData }) {
  const params = useSearchParams()
  const id = params.get("id")
  const [session] = useSession()
  const [index, setIndex] = useState<DoctorIndex | null>(null)
  const [doc, setDoc] = useState<Dossier | null>(null)
  const [contacts, setContacts] = useState<ChatRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [handled, setHandled] = useState<Handled | undefined>(undefined)
  const [text, setText] = useState("")
  const [copied, setCopied] = useState(false)

  const names = useMemo(() => Object.fromEntries(data.specialists.map((s) => [s.id, s.name])), [data.specialists])
  const queueRow = useMemo(() => data.watchlist.items.find((w) => w.doctor_id === id), [data.watchlist.items, id])
  const allowed = useMemo(
    () => (owner: string) => session.role === "manager" || owner === session.me,
    [session],
  )

  useEffect(() => {
    loadIndex().then(setIndex).catch(() => setError(MISSING_FILES))
  }, [])

  const owner = id && index?.[id]?.[0]
  const visible = !!owner && allowed(owner)

  useEffect(() => {
    setDoc(null)
    setContacts([])
    setCopied(false)
    if (!id || !owner || !visible) return
    loadDossier(owner, id)
      .then((d) => {
        setDoc(d)
        setText(d?.copilot.mode === "draft" && d.copilot.confident ? (d.copilot.draft ?? "") : "")
      })
      .catch(() => setError(MISSING_FILES))
    loadChats(owner)
      .then((c) => setContacts([...(c[id] ?? [])].reverse()))
      .catch(() => setContacts([]))
    setHandled(loadHandled()[id])
  }, [id, owner, visible])

  const mark = (h: Handled | null) => {
    if (!id) return
    const all = loadHandled()
    if (h) all[id] = h
    else delete all[id]
    saveHandled(all)
    setHandled(h ?? undefined)
  }

  if (error) return <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
  if (!index) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!id) return <Finder index={index} allowed={allowed} />
  if (!owner) return <Finder index={index} allowed={allowed} message={`No doctor with ID ${id} in this build.`} />
  if (!visible)
    return <Finder index={index} allowed={allowed} message="This doctor is in another specialist's book. As a specialist you can open your own doctors." />
  if (!doc) return <p className="text-sm text-muted-foreground">Loading…</p>

  const today = new Date().toISOString().slice(0, 10)
  const signals = [
    doc.sig_churn_threat && "Said they may cancel",
    doc.sig_discouraged && "Discouraged with results",
    doc.sig_whatsapp_only && "WhatsApp only",
    doc.sig_gatekeeper && "Assistant runs the agenda",
    doc.sig_multi_site && "Several clinics",
    doc.sig_billing_issue && "Billing issue",
    doc.sig_onboarding_no_show && "Missed onboarding kickoff",
  ].filter(Boolean) as string[]
  const reasons = (doc.risk_reasons ?? "").split(" · ").filter(Boolean)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{doc.doctor_name}</h2>
          <Badge variant="secondary" className={cn(doc.status === "churned" && "bg-destructive/10 text-destructive")}>
            {doc.status}
          </Badge>
          {doc.top_signal && SIGNAL_LABEL[doc.top_signal] && (
            <Badge variant="secondary" className="bg-destructive/10 text-destructive">
              {SIGNAL_LABEL[doc.top_signal]}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {doc.specialty} · {doc.city} · {doc.doctor_id} · {doc.segment ?? "—"} · {doc.product ?? "—"} · owner{" "}
          {names[doc.owner_specialist_id] ?? doc.owner_specialist_id}
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href={`/conversations?open=${doc.doctor_id}`} className="text-primary underline-offset-4 hover:underline">
            Open conversation →
          </Link>
          <Link href="/doctor" className="text-primary underline-offset-4 hover:underline">
            Find another doctor
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Risk" className="lg:col-span-1">
          <div className="flex flex-col gap-3">
            <p className="text-4xl font-semibold tabular-nums text-foreground">{formatPercent(doc.risk_score, 0)}</p>
            {reasons.length ? (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
                {reasons.map((r) => (
                  <li key={r} className="text-pretty">
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No warning sign scores points.</p>
            )}
            {queueRow?.days_of_lead_left != null && (
              <p className="text-sm text-foreground">
                {queueRow.overdue ? "Past" : `${queueRow.days_of_lead_left} days left of`} the usual warning window
                {queueRow.lead_median != null && ` (${queueRow.lead_median} days)`}.
              </p>
            )}
            <RiskExplainer risk={data.risk} reasons={doc.risk_reasons} />
          </div>
        </Section>

        <Section title="What to do" className="lg:col-span-2">
          <div className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              {doc.copilot.mode === "brief" ? "Call — not a message" : doc.copilot.mode === "draft" ? "Send a message" : doc.copilot.mode === "handoff" ? "Route it" : "No action"}
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                evidence {formatPercent(doc.copilot.confidence, 0)}
                {doc.copilot.play && ` · play ${doc.copilot.play}`}
              </span>
              {handled && (
                <Badge variant="secondary" className="bg-success/10 text-success">
                  {handled.state === "done" ? (handled.via === "whatsapp" ? "sent" : handled.via === "call" ? "called" : "done") : `snoozed to ${handled.until}`}
                </Badge>
              )}
            </p>
            {doc.copilot.why && <p className="text-xs text-muted-foreground text-pretty">{doc.copilot.why}</p>}
            {doc.copilot.channel && <p className="text-xs text-warning">⚑ {doc.copilot.channel}</p>}
            {doc.copilot.mode === "draft" && doc.copilot.confident ? (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  aria-label="Draft message, editable"
                  className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap gap-2">
                  <WhatsAppButton text={text} onOpened={() => mark({ state: "done", at: today, via: "whatsapp" })} />
                  <Button size="sm" variant="outline" onClick={copy}>
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy draft"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{doc.copilot.instead}</pre>
                {doc.copilot.mode === "brief" && !handled && (
                  <Button size="sm" className="w-fit" onClick={() => mark({ state: "done", at: today, via: "call" })}>
                    <PhoneCall className="size-3.5" /> Mark call done
                  </Button>
                )}
              </>
            )}
            {handled && (
              <Button size="sm" variant="ghost" className="w-fit" onClick={() => mark(null)}>
                Undo
              </Button>
            )}
          </div>
        </Section>
      </div>

      <Section title="Bookings and peers">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label="Average / month" value={num(doc.bookings_avg, 1)} hint={doc.median_specialty_city != null ? `peer median ${num(doc.median_specialty_city, 1)}` : undefined} />
            <Fact label="Last month" value={num(doc.bookings_last)} hint={doc.bookings_prev != null ? `month before ${num(doc.bookings_prev)}` : undefined} />
            <Fact label="Change" value={doc.bookings_change_pct == null ? "—" : formatPercent(doc.bookings_change_pct, 0)} />
            <Fact label="Vs peers" value={doc.pct_specialty_city != null ? `p${Math.round(doc.pct_specialty_city * 100)}` : "—"} hint={doc.bottom_quartile ? "bottom quartile" : "same specialty and city"} />
            <Fact label="Peak month" value={num(doc.bookings_peak)} hint={doc.months_since_peak != null ? `${doc.months_since_peak} months ago` : undefined} />
            <Fact label="Booked by staff" value={doc.admin_share == null ? "—" : formatPercent(doc.admin_share, 0)} hint="admin share of bookings" />
            <Fact label="Bookings per slot" value={num(doc.bookings_per_slot, 2)} />
            <Fact label="Not being found" value={yes(doc.demand_constrained)} hint="slots to spare, still below peers" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Monthly in the source system: {doc.bookings.length} {doc.bookings.length === 1 ? "point" : "points"}, not a trend line.
            </p>
            <MonthlyDots rows={doc.bookings} peer={doc.median_specialty_city} />
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Setup">
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Signed up" value={date(doc.signup_date)} hint={doc.churned_at ? `churned ${date(doc.churned_at)}` : undefined} />
            <Fact label="Onboarding" value={doc.onboarding_grade ? `${doc.onboarding_grade} · ${num(doc.onboarding_score)}` : "—"} hint={doc.onboarding_days != null ? `${doc.onboarding_days} days${doc.closed_at_cap ? ", closed at the cap" : ""}` : undefined} />
            <Fact label="Calendar" value={doc.calendar_enabled ? `on · ${doc.weekly_slots_published ?? 0} slots/wk` : "off"} hint={doc.calendar_enabled_at ? `since ${date(doc.calendar_enabled_at)}` : undefined} />
            <Fact label="Agenda too thin" value={yes(doc.calendar_hollow)} hint={`fewer than ${data.rules.calendar_healthy_slots} slots`} />
          </div>
        </Section>

        <Section title="Relationship">
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Last contact" value={date(doc.last_contact)} hint={doc.days_since_contact != null ? `${doc.days_since_contact} days ago` : "never"} />
            <Fact label="Contacts" value={num(doc.contacts_total)} hint={doc.contacts_farming != null ? `${doc.contacts_farming} by farming` : undefined} />
            <Fact label="Campaigns" value={`${num(doc.campaigns_engaged)} of ${num(doc.campaigns_enrolled)} engaged`} hint={doc.campaigns_60d != null ? `${doc.campaigns_60d} in the last 60 days` : undefined} />
            <Fact label="Responds to" value={doc.responds_to ?? "—"} hint={doc.ignores ? `ignores ${doc.ignores}` : undefined} />
            <Fact label="Unanswered messages" value={num(doc.unanswered_outbound)} hint={doc.ever_replied === false ? "has never replied" : undefined} />
            <Fact label="Complaints" value={num(doc.complaints)} />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Signals and commitments">
          <div className="flex flex-col gap-3 text-sm">
            {signals.length ? (
              <div className="flex flex-wrap gap-1.5">
                {signals.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No signals in the notes.</p>
            )}
            {doc.top_signal_note && (
              <blockquote className="border-l-2 border-border pl-3 italic text-foreground text-pretty">
                &ldquo;{doc.top_signal_note}&rdquo; <span className="not-italic text-xs text-muted-foreground">— {date(doc.top_signal_at)}</span>
              </blockquote>
            )}
            <p className="text-foreground">
              <span className="font-medium">Open commitment: </span>
              {doc.commitment_open ? `${doc.open_ask ?? "yes"} (${num(doc.days_commitment_open)} days open)` : "none"}
            </p>
            {doc.upsell_signal && (
              <p className="text-foreground">
                <span className="font-medium">Upsell lead: </span>
                {doc.upsell_signal}
                {doc.upsell_note && <span className="text-muted-foreground"> — “{doc.upsell_note}”</span>}
              </p>
            )}
          </div>
        </Section>

        <Section title="Escalations">
          {doc.escalation_log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No escalations.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Date</th>
                  <th className="py-1 pr-2 font-medium">Picked up by</th>
                  <th className="py-1 pr-2 text-right font-medium">Minutes</th>
                  <th className="py-1 text-right font-medium">Converted</th>
                </tr>
              </thead>
              <tbody>
                {doc.escalation_log.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-2">{date(e.escalated_at)}</td>
                    <td className="py-1 pr-2">{names[e.specialist_id] ?? e.specialist_id.replaceAll("_", " ")}</td>
                    <td className={cn("py-1 pr-2 text-right", e.minutes_to_pickup > data.rules.escalation_pickup_target_min && "text-destructive")}>
                      {Math.round(e.minutes_to_pickup)}
                    </td>
                    <td className="py-1 text-right">{e.converted ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title={`Contact history (${contacts.length})`}>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts recorded.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {contacts.map(([at, channel, dir, who, note], i) => (
              <li key={i} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {at} · {channel} · {dir === "inbound" ? "from doctor" : "to doctor"} · {names[who] ?? who}
                </span>
                <span className="text-sm text-foreground text-pretty">{note ?? "—"}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  )
}
