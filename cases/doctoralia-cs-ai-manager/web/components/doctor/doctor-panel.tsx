"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Check, Clock, Copy, PhoneCall, Route, X } from "lucide-react"
import { RiskExplainer } from "@/components/risk-explainer"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import { MISSING_FILES, loadChats, loadDossier } from "@/lib/dossiers"
import type { Handled } from "@/lib/controls"
import type { ChatRow, Dossier, RiskRules } from "@/lib/types"

const MODE: Record<string, { label: string; icon: typeof Copy }> = {
  draft: { label: "Draft message", icon: Copy },
  brief: { label: "Not a message · call brief", icon: PhoneCall },
  handoff: { label: "Route it", icon: Route },
}

export function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Five monthly points drawn as points, because five points are not a trend line. */
export function MonthlyDots({ rows, peer }: { rows: Dossier["bookings"]; peer: number | null }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No bookings recorded.</p>
  const max = Math.max(...rows.map((r) => r.patient_bookings), peer ?? 0, 1)
  const W = 280
  const H = 72
  const x = (i: number) => (rows.length === 1 ? W / 2 : 16 + (i * (W - 32)) / (rows.length - 1))
  const y = (v: number) => H - 14 - (v / max) * (H - 28)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full max-w-sm" role="img" aria-label="Patient bookings by month">
      {peer != null && (
        <>
          <line x1={8} x2={W - 8} y1={y(peer)} y2={y(peer)} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" strokeWidth={1} />
          <text x={W - 8} y={y(peer) - 4} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">
            peer median {Number(peer.toFixed(1))}
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
            {new Date(`${r.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function DoctorPanel({
  target,
  ownerName,
  risk,
  handled,
  onHandle,
  onClose,
}: {
  target: { id: string; owner: string } | null
  ownerName: (id: string) => string
  risk: RiskRules
  handled: Handled | undefined
  onHandle: (h: Handled | null) => void
  onClose: () => void
}) {
  const [doc, setDoc] = useState<Dossier | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [copied, setCopied] = useState(false)
  const [contacts, setContacts] = useState<ChatRow[]>([])
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!target) return
    setDoc(null)
    setError(null)
    setCopied(false)
    setContacts([])
    loadDossier(target.owner, target.id)
      .then((d) => {
        if (!d) setError("This doctor is not in the current build.")
        setDoc(d)
        setText(d?.copilot.draft ?? "")
      })
      .catch(() => setError(MISSING_FILES))
    loadChats(target.owner)
      .then((c) => setContacts((c[target.id] ?? []).slice(-6).reverse()))
      .catch(() => setContacts([]))
    closeRef.current?.focus()
  }, [target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!target) return null
  const today = new Date().toISOString().slice(0, 10)
  const inAWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const mode = doc?.copilot.mode ? MODE[doc.copilot.mode] : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={doc?.doctor_name ?? "Doctor"}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-lg font-semibold text-foreground">{doc?.doctor_name ?? "Loading…"}</h2>
            {doc && (
              <p className="text-sm text-muted-foreground">
                {doc.specialty} · {doc.city} · {doc.doctor_id} · owner {ownerName(doc.owner_specialist_id)}
              </p>
            )}
          </div>
          <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </header>

        {error && <p className="m-5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {doc && (
          <div className="flex flex-col gap-6 px-5 py-5">
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={cn(doc.status === "churned" && "bg-destructive/10 text-destructive")}>
                  {doc.status}
                </Badge>
                <span className="text-sm text-muted-foreground">risk</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">{formatPercent(doc.risk_score, 0)}</span>
              </div>
              <p className="text-sm text-foreground text-pretty">
                <span className="font-medium">Why now: </span>
                {doc.risk_reasons || "no active signal"}
              </p>
              <RiskExplainer risk={risk} reasons={doc.risk_reasons} />
              {doc.top_signal_note && (
                <blockquote className="border-l-2 border-border pl-3 text-sm italic text-foreground text-pretty">
                  &ldquo;{doc.top_signal_note}&rdquo;
                  <span className="not-italic text-xs text-muted-foreground"> — {doc.top_signal_at}</span>
                </blockquote>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {mode && <mode.icon className="size-4" aria-hidden />}
                  {mode?.label ?? "No action"}
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  evidence {formatPercent(doc.copilot.confidence, 0)}
                  {doc.copilot.play && ` · play ${doc.copilot.play}`}
                </span>
              </div>
              {doc.copilot.channel && <p className="text-xs text-warning">⚑ {doc.copilot.channel}</p>}
              {doc.copilot.confident && doc.copilot.draft ? (
                <>
                  {doc.copilot.why && <p className="text-xs text-muted-foreground text-pretty">{doc.copilot.why}</p>}
                  <textarea
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value)
                      setCopied(false)
                    }}
                    rows={7}
                    className="w-full resize-y rounded-lg border border-input bg-card p-3 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Draft message, editable"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <WhatsAppButton
                      text={text}
                      onOpened={() => onHandle({ state: "done", at: today, via: "whatsapp" })}
                    />
                    <Button size="sm" variant="outline" onClick={copy}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy draft"}
                    </Button>
                    {text !== doc.copilot.draft && (
                      <Button size="sm" variant="ghost" onClick={() => setText(doc.copilot.draft ?? "")}>
                        Reset
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Opens WhatsApp with this text; you choose the chat and press send. Marked as sent here.
                  </p>
                </>
              ) : (
                <>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{doc.copilot.instead}</pre>
                  {doc.copilot.mode === "brief" && !handled && (
                    <Button size="sm" className="w-fit" onClick={() => onHandle({ state: "done", at: today, via: "call" })}>
                      <PhoneCall className="size-3.5" /> Mark call done
                    </Button>
                  )}
                </>
              )}
            </section>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Fact
                label="Onboarding"
                value={doc.onboarding_grade ? `${doc.onboarding_grade} · ${doc.onboarding_score ?? "—"}` : "—"}
                hint={doc.sig_onboarding_no_show ? "missed the kickoff" : doc.closed_at_cap ? "closed at the 28-day cap" : undefined}
              />
              <Fact
                label="Calendar"
                value={doc.calendar_enabled ? `on · ${doc.weekly_slots_published ?? 0} slots/wk` : "off"}
              />
              <Fact
                label="Bookings / month"
                value={doc.bookings_avg != null ? doc.bookings_avg.toFixed(1) : "—"}
                hint={doc.median_specialty_city != null ? `peer median ${Number(doc.median_specialty_city.toFixed(1))}` : undefined}
              />
              <Fact
                label="Vs peers"
                value={doc.pct_specialty_city != null ? `p${Math.round(doc.pct_specialty_city * 100)}` : "—"}
                hint="same specialty and city"
              />
              <Fact label="Last contact" value={doc.days_since_contact != null ? `${doc.days_since_contact} days ago` : "never"} />
              <Fact label="Signed up" value={doc.signup_date ?? "—"} hint={doc.churned_at ? `churned ${doc.churned_at}` : undefined} />
            </section>

            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground">Patient bookings by month</h3>
              <p className="text-xs text-muted-foreground">
                Monthly in the source system: {doc.bookings.length} {doc.bookings.length === 1 ? "point" : "points"}, not a trend line.
              </p>
              <MonthlyDots rows={doc.bookings} peer={doc.median_specialty_city} />
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Last contacts</h3>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts recorded.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {contacts.map(([at, channel, dir, who, note], i) => (
                    <li key={i} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {at} · {channel} · {dir} · {ownerName(who)}
                      </span>
                      <span className="text-sm text-foreground text-pretty">{note ?? "—"}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex gap-4 pt-1 text-sm">
                <Link href={`/doctor?id=${doc.doctor_id}`} className="text-primary underline-offset-4 hover:underline">
                  Full profile →
                </Link>
                <Link href={`/conversations?open=${doc.doctor_id}`} className="text-primary underline-offset-4 hover:underline">
                  Open conversation →
                </Link>
              </div>
            </section>
          </div>
        )}

        <footer className="sticky bottom-0 mt-auto flex gap-2 border-t border-border bg-card px-5 py-3">
          {handled ? (
            <Button variant="outline" size="sm" onClick={() => onHandle(null)}>
              Undo {handled.state === "done" ? (handled.via === "whatsapp" ? "sent" : handled.via === "call" ? "call done" : "done") : "snooze"}
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => onHandle({ state: "done", at: today })}>
                <Check className="size-3.5" /> Done
              </Button>
              <Button variant="outline" size="sm" onClick={() => onHandle({ state: "snoozed", at: today, until: inAWeek })}>
                <Clock className="size-3.5" /> Snooze 7d
              </Button>
            </>
          )}
        </footer>
      </aside>
    </div>
  )
}
