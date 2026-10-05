"use client"

// /conversaciones: every logged contact with a doctor, as a chat, with up to three open side by
// side. The history is the dossier's (contacts_all, else contacts); nothing here is computed.
// Sending stays human: WhatsApp opens with the text ready, and the outcome is logged on the
// doctor sheet's Acción tab, the same place as everywhere else.
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, Mail, MessageCircle, Search, SquareArrowOutUpRight, X } from "lucide-react"
import { doctorHref } from "@/components/shell/doctor-sheet-host"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { loadBook } from "@/lib/dossiers"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { fold } from "@/lib/search"
import { useShell } from "@/lib/shell"
import type { Contact, Dossier } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_OPEN = 3

export function ConversationsScreen() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Conversations />
    </Suspense>
  )
}

const history = (d: Dossier): Contact[] => d.contacts_all ?? d.contacts

function Conversations() {
  const { t } = useT()
  const shell = useShell()
  const { who, scope, ready } = useIdentity()
  const router = useRouter()
  const path = usePathname()
  const params = useSearchParams()

  // A specialist reads their own book. A manager picks one specialist in the scope they are
  // looking at (a book is one file; the whole portfolio at once would be 21 MB).
  const specialist = who?.kind === "specialist" ? who.id : null
  const owners = useMemo(() => {
    if (specialist) return shell.specialists.filter((s) => s.id === specialist)
    if (/^S\d+$/.test(scope)) return shell.specialists.filter((s) => s.id === scope)
    if (scope.startsWith("team:")) return shell.specialists.filter((s) => s.team === scope.slice(5))
    return shell.specialists
  }, [specialist, scope, shell.specialists])
  const urlOwner = params.get("owner")
  const owner = specialist ?? (owners.some((s) => s.id === urlOwner) ? urlOwner! : owners[0]?.id ?? null)

  const [book, setBook] = useState<Map<string, Dossier> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!ready || !owner) return
    let live = true
    setBook(null)
    setFailed(false)
    loadBook(owner)
      .then((b) => live && setBook(b))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [ready, owner])

  const open = useMemo(
    () => (params.get("open") ?? "").split(",").filter((id) => id && book?.has(id)).slice(0, MAX_OPEN),
    [params, book],
  )
  const setUrl = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k)
      else next.set(k, v)
    }
    const s = next.toString()
    router.replace(s ? `${path}?${s}` : path, { scroll: false })
  }
  // opening a fourth chat closes the oldest one
  const openChat = (id: string) => {
    if (open.includes(id)) return
    setUrl({ open: [...open, id].slice(-MAX_OPEN).join(",") })
  }
  const closeChat = (id: string) => setUrl({ open: open.filter((x) => x !== id).join(",") || null })

  if (!ready || (!book && !failed))
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[480px] rounded-xl" />
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
    )
  if (failed || !book) return <Card className="items-center py-12 text-sm text-muted-foreground">{t("conv.missing")}</Card>

  return (
    <div className="flex flex-col gap-4">
      {!specialist && owners.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">{t("conv.book")}</span>
          <select
            value={owner ?? ""}
            onChange={(e) => setUrl({ owner: e.target.value, open: null })}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {owners.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        <Inbox book={book} open={open} onOpen={openChat} />
        {open.length === 0 ? (
          <Card className="items-center justify-center py-16 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-6" aria-hidden />
            <p className="max-w-xs text-pretty">{t("conv.empty", { n: MAX_OPEN })}</p>
          </Card>
        ) : (
          <div className={cn("grid gap-4", open.length > 1 && "xl:grid-cols-2", open.length > 2 && "2xl:grid-cols-3")}>
            {open.map((id) => (
              <ChatPane
                key={id}
                doc={book.get(id)!}
                onClose={() => closeChat(id)}
                sheetHref={doctorHref(path, params, id, "action")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Inbox({ book, open, onOpen }: { book: Map<string, Dossier>; open: string[]; onOpen: (id: string) => void }) {
  const { t, day } = useT()
  const [q, setQ] = useState("")
  const [waiting, setWaiting] = useState(false)
  const rows = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    return [...book.values()]
      .map((d) => ({ d, last: history(d)[0] as Contact | undefined }))
      .filter(({ d, last }) => last && (!waiting || last.direction === "inbound") && words.every((w) => fold(`${d.doctor_name} ${d.doctor_id} ${d.specialty}`).includes(w)))
      .sort((a, b) => (a.last!.occurred_at < b.last!.occurred_at ? 1 : a.last!.occurred_at > b.last!.occurred_at ? -1 : 0))
  }, [book, q, waiting])
  const shown = rows.slice(0, 200)
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("conv.search")}
            aria-label={t("conv.search")}
            className="h-9 w-full rounded-lg border border-input bg-card pr-2.5 pl-8 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} className="accent-primary" />
          {t("conv.waiting")}
        </label>
        <p className="text-xs text-muted-foreground tabular-nums">{t("conv.count", { n: rows.length })}</p>
      </div>
      <ul className="max-h-[560px] overflow-y-auto" data-testid="conv-inbox">
        {shown.map(({ d, last }) => (
          <li key={d.doctor_id}>
            <button
              type="button"
              onClick={() => onOpen(d.doctor_id)}
              aria-pressed={open.includes(d.doctor_id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                open.includes(d.doctor_id) && "bg-accent/40",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{d.doctor_name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{day(last!.occurred_at)}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {last!.direction === "inbound" && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label={t("conv.waiting.dot")} />}
                <span className="truncate">{last!.note ?? t("conv.no_note")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && <p className="border-t border-border p-2 text-center text-xs text-muted-foreground">{t("conv.more", { n: rows.length - shown.length })}</p>}
    </Card>
  )
}

function ChatPane({ doc, onClose, sheetHref }: { doc: Dossier; onClose: () => void; sheetHref: string }) {
  const { t, day, num } = useT()
  const shell = useShell()
  const router = useRouter()
  // oldest first, like any chat
  const msgs = useMemo(() => [...history(doc)].reverse(), [doc])
  const original = doc.copilot.mode === "draft" ? (doc.copilot.draft ?? "") : ""
  const [text, setText] = useState(original)
  const [copied, setCopied] = useState(false)
  const nameOf = (id: string) => shell.specialists.find((s) => s.id === id)?.name.split(" ")[0] ?? id
  // open on the newest message, like any chat (scrollTop, not scrollIntoView: see HANDOFF Phase 4)
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  return (
    <Card className="min-w-0 gap-0 py-0" data-testid="conv-pane">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{doc.doctor_name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {doc.specialty} · {doc.city} · {t("conv.risk", { r: num(doc.risk_score, 2) })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => router.push(sheetHref, { scroll: false })}>
            <SquareArrowOutUpRight />
            {t("conv.sheet")}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={t("conv.close")}>
            <X />
          </Button>
        </div>
      </div>
      <ol ref={list} className="flex max-h-[420px] min-h-[200px] flex-col gap-2 overflow-y-auto bg-muted/30 px-3 py-3">
        {msgs.map((m, i) => {
          const out = m.direction === "outbound"
          return (
            <li key={i} className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-xs",
                  out ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-card text-foreground",
                )}
              >
                <p className="text-pretty whitespace-pre-wrap">{m.note ?? t("conv.no_note")}</p>
                <p className={cn("mt-1 flex items-center gap-1 text-[11px]", out ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {m.channel === "email" ? <Mail className="size-3" aria-hidden /> : <MessageCircle className="size-3" aria-hidden />}
                  {t(m.channel === "email" ? "conv.channel.email" : "conv.channel.whatsapp")} · {day(m.occurred_at)}
                  {out && ` · ${nameOf(m.specialist_id)}`}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={t("conv.compose")}
          aria-label={t("conv.compose")}
          className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!text.trim()}
            title={t("focus.whatsapp.hint")}
            className={cn(buttonVariants({ size: "sm" }), !text.trim() && "pointer-events-none opacity-50")}
          >
            <MessageCircle />
            {t("focus.whatsapp")}
          </a>
          <Button
            size="sm"
            variant="outline"
            disabled={!text.trim()}
            onClick={() => {
              navigator.clipboard?.writeText(text).then(
                () => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                },
                () => {},
              )
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? t("focus.copied") : t("focus.copy")}
          </Button>
          {original && <span className="text-xs text-muted-foreground">{t("conv.draft_note")}</span>}
        </div>
      </div>
    </Card>
  )
}
