"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Mail, MessageCircle, NotebookPen, PhoneCall, Search, X } from "lucide-react"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatPercent } from "@/lib/format"
import { ACTION_LABEL, SIGNAL_LABEL, isHandled, loadHandled, saveHandled, type Handled } from "@/lib/controls"
import { MISSING_FILES, loadChats, loadDossier, loadIndex } from "@/lib/dossiers"
import { addNote, loadNotes, type LocalNote } from "@/lib/local-notes"
import { useSession } from "@/lib/session"
import type { ChatRow, DoctorIndex, Dossier, OverviewData, WatchItem } from "@/lib/types"

const MAX_OPEN = 3
const OPEN_KEY = "cs-control-room:open-chats:v1"

interface Thread {
  id: string
  owner: string
  name: string
  specialty: string
  city: string
  status: string
  rows: ChatRow[]
  last: string | null
}

function ChannelIcon({ channel }: { channel: string }) {
  const I = channel === "email" ? Mail : channel === "phone" ? PhoneCall : channel === "note" ? NotebookPen : MessageCircle
  return <I className="size-3" aria-label={channel} />
}

function dayLabel(d: string) {
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

/** One open conversation. */
function ChatPane({
  thread,
  queue,
  notes,
  handled,
  ownerName,
  onClose,
  onNote,
  onHandle,
}: {
  thread: Thread
  queue: WatchItem | undefined
  notes: LocalNote[]
  handled: Handled | undefined
  ownerName: (id: string) => string
  onClose: () => void
  onNote: (n: LocalNote) => void
  onHandle: (h: Handled | null) => void
}) {
  const [doc, setDoc] = useState<Dossier | null>(null)
  const [text, setText] = useState("")
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadDossier(thread.owner, thread.id)
      .then((d) => {
        setDoc(d)
        setText(d?.copilot.mode === "draft" && d.copilot.confident ? (d.copilot.draft ?? "") : "")
      })
      .catch(() => setDoc(null))
  }, [thread.owner, thread.id])

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [thread.rows.length, notes.length])

  // the log and the notes logged here, in one timeline
  const items = useMemo(() => {
    const log = thread.rows.map(([at, channel, direction, who, note]) => ({ at, channel, direction, who, text: note ?? "—", local: false }))
    const mine = notes.map((n) => ({ at: n.at, channel: n.channel, direction: n.direction, who: "", text: n.text, local: true }))
    return [...log, ...mine].sort((a, b) => a.at.localeCompare(b.at))
  }, [thread.rows, notes])

  const now = new Date()
  const off = isHandled(handled, now)
  const stamp = () => new Date().toISOString()

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col rounded-xl border border-border bg-card" aria-label={`Conversation with ${thread.name}`}>
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{thread.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {thread.specialty} · {thread.city} · {ownerName(thread.owner)}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs">
            {queue && <span className="font-medium tabular-nums text-foreground">risk {formatPercent(queue.risk_score, 0)}</span>}
            {queue?.top_signal && SIGNAL_LABEL[queue.top_signal] && (
              <span className="text-destructive">{SIGNAL_LABEL[queue.top_signal]}</span>
            )}
            {queue && queue.action !== "none" && (
              <span className="text-muted-foreground">next: {ACTION_LABEL[queue.action as keyof typeof ACTION_LABEL]}</span>
            )}
            {off && <span className="text-success">handled</span>}
            <Link href={`/doctor?id=${thread.id}`} className="text-primary underline-offset-4 hover:underline">
              Profile
            </Link>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close conversation with ${thread.name}`}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
        {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No contacts logged yet.</p>}
        {items.map((m, i) => {
          const showDay = i === 0 || items[i - 1].at.slice(0, 10) !== m.at.slice(0, 10)
          const out = m.direction === "outbound"
          const internal = m.direction === "internal"
          return (
            <div key={i}>
              {showDay && (
                <p className="py-1 text-center text-[11px] font-medium text-muted-foreground">{dayLabel(m.at)}</p>
              )}
              <div className={cn("flex", out ? "justify-end" : internal ? "justify-center" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    out && "rounded-br-sm bg-primary/12 text-foreground",
                    !out && !internal && "rounded-bl-sm border border-border bg-background text-foreground",
                    internal && "border border-dashed border-border bg-muted/50 text-foreground",
                  )}
                >
                  <p className="text-pretty">{m.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ChannelIcon channel={m.channel} />
                    {m.local ? "logged here" : `${m.direction === "inbound" ? "from doctor" : "to doctor"} · ${ownerName(m.who)}`}
                    {m.local && ` · ${new Date(m.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-border px-3 py-3">
        {doc?.copilot.mode === "brief" ? (
          <details className="rounded-lg border border-border bg-background text-sm">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-destructive">
              Call, do not message — open the call brief
            </summary>
            <pre className="whitespace-pre-wrap px-3 pb-3 font-sans text-xs leading-relaxed text-foreground">{doc.copilot.instead}</pre>
          </details>
        ) : doc?.copilot.mode === "draft" && doc.copilot.confident ? (
          <p className="text-[11px] text-muted-foreground">Copilot draft below — edit it, then send.</p>
        ) : doc?.copilot.instead ? (
          <p className="text-[11px] text-muted-foreground text-pretty">{doc.copilot.instead.split("\n")[0]}</p>
        ) : null}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write a message or a note…"
          aria-label="Message or note"
          className="w-full resize-y rounded-lg border border-input bg-background p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <WhatsAppButton
            text={text}
            onOpened={() => {
              onNote({ at: stamp(), channel: "whatsapp", direction: "outbound", text })
              onHandle({ state: "done", at: stamp().slice(0, 10), via: "whatsapp" })
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!text.trim()}
            onClick={() => {
              onNote({ at: stamp(), channel: "note", direction: "internal", text })
              setText("")
            }}
          >
            <NotebookPen className="size-3.5" /> Log note
          </Button>
          {doc?.copilot.mode === "brief" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onNote({ at: stamp(), channel: "phone", direction: "outbound", text: text.trim() || "Call made." })
                onHandle({ state: "done", at: stamp().slice(0, 10), via: "call" })
                setText("")
              }}
            >
              <PhoneCall className="size-3.5" /> Log call
            </Button>
          )}
        </div>
      </footer>
    </section>
  )
}

export function ConversationsScreen({ data }: { data: OverviewData }) {
  const [session] = useSession()
  const params = useSearchParams()
  const [index, setIndex] = useState<DoctorIndex | null>(null)
  const [chats, setChats] = useState<Record<string, ChatRow[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [owner, setOwner] = useState<string>("all")
  const [q, setQ] = useState("")
  const [needsAction, setNeedsAction] = useState(true)
  const [open, setOpen] = useState<string[]>([])
  const [notes, setNotes] = useState<Record<string, LocalNote[]>>({})
  const [handled, setHandled] = useState<Record<string, Handled>>({})

  const names = useMemo(() => Object.fromEntries(data.specialists.map((s) => [s.id, s.name])), [data.specialists])
  const ownerName = useCallback((id: string) => names[id] ?? id, [names])
  const queue = useMemo(() => new Map(data.watchlist.items.map((w) => [w.doctor_id, w])), [data.watchlist.items])

  // A specialist sees only their book. A manager picks one specialist or everyone.
  const owners = useMemo(
    () => (session.role === "specialist" && session.me ? [session.me] : owner === "all" ? data.specialists.map((s) => s.id) : [owner]),
    [session, owner, data.specialists],
  )

  useEffect(() => {
    setNotes(loadNotes())
    setHandled(loadHandled())
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(OPEN_KEY) ?? "[]") as string[]
      const want = params.get("open")
      setOpen([...(want ? [want] : []), ...saved.filter((x) => x !== want)].slice(0, MAX_OPEN))
    } catch {
      const want = params.get("open")
      if (want) setOpen([want])
    }
  }, [params])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(OPEN_KEY, JSON.stringify(open))
    } catch {
      // not persisted; the open chats still work
    }
  }, [open])

  useEffect(() => {
    let live = true
    setError(null)
    Promise.all([loadIndex(), ...owners.map((o) => loadChats(o))])
      .then(([idx, ...books]) => {
        if (!live) return
        setIndex(idx as DoctorIndex)
        setChats(Object.assign({}, ...(books as Record<string, ChatRow[]>[])))
      })
      .catch(() => live && setError(MISSING_FILES))
    return () => {
      live = false
    }
  }, [owners])

  const threads = useMemo<Thread[]>(() => {
    if (!index) return []
    const ownerSet = new Set(owners)
    return Object.entries(index)
      .filter(([, v]) => ownerSet.has(v[0]))
      .map(([id, [o, name, specialty, city, status]]) => {
        const rows = chats[id] ?? []
        return { id, owner: o, name, specialty, city, status, rows, last: rows.length ? rows[rows.length - 1][0] : null }
      })
  }, [index, chats, owners])

  const now = useMemo(() => new Date(), [])
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return threads
      .filter((t) => t.status === "active")
      .filter((t) => !term || `${t.name} ${t.specialty} ${t.city}`.toLowerCase().includes(term))
      .filter((t) => !needsAction || (queue.has(t.id) && queue.get(t.id)!.action !== "none" && !isHandled(handled[t.id], now)))
      .sort((a, b) =>
        needsAction
          ? (queue.get(b.id)?.risk_score ?? 0) - (queue.get(a.id)?.risk_score ?? 0)
          : (b.last ?? "").localeCompare(a.last ?? ""),
      )
  }, [threads, q, needsAction, queue, handled, now])

  const byId = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads])

  const openChat = (id: string) =>
    setOpen((o) => (o.includes(id) ? o : [id, ...o].slice(0, MAX_OPEN)))
  const closeChat = (id: string) => setOpen((o) => o.filter((x) => x !== id))
  const onHandle = (id: string, h: Handled | null) =>
    setHandled((prev) => {
      const next = { ...prev }
      if (h) next[id] = h
      else delete next[id]
      saveHandled(next)
      return next
    })

  const openThreads = open.map((id) => byId.get(id)).filter((t): t is Thread => !!t)
  const hiddenOpen = open.filter((id) => index && !byId.has(id))

  return (
    <>
      <section className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Conversations</h2>
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">
          Every logged contact with a doctor, as a conversation. The source keeps the specialist&apos;s note of each
          contact, not the messages themselves, so each bubble is that note. Open up to {MAX_OPEN} conversations side by
          side. Sending opens WhatsApp with the text ready; nothing is sent from here.
        </p>
      </section>

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
        <aside className="flex max-h-[75vh] flex-col rounded-xl border border-border bg-card" aria-label="Inbox">
          <div className="flex flex-col gap-2 border-b border-border p-3">
            {session.role === "manager" && (
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                aria-label="Whose doctors"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All specialists</option>
                {data.specialists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search doctor, specialty, city"
                aria-label="Search conversations"
                className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={needsAction} onChange={(e) => setNeedsAction(e.target.checked)} />
              Only doctors that need an action
            </label>
            <span className="text-xs tabular-nums text-muted-foreground">{visible.length.toLocaleString("en-US")} conversations</span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {!index && !error && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
            {visible.slice(0, 300).map((t) => {
              const w = queue.get(t.id)
              const last = t.rows[t.rows.length - 1]
              const isOpen = open.includes(t.id)
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openChat(t.id)}
                    aria-pressed={isOpen}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isOpen && "bg-primary/8",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{t.last ? t.last.slice(5) : "—"}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{last?.[4] ?? "No contacts yet"}</span>
                    {w && w.action !== "none" && (
                      <span className={cn("text-[11px] font-medium", w.action === "brief" ? "text-destructive" : "text-foreground")}>
                        {ACTION_LABEL[w.action as keyof typeof ACTION_LABEL]} · risk {formatPercent(w.risk_score, 0)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {visible.length > 300 && (
              <li className="p-3 text-xs text-muted-foreground">Showing the first 300. Search to narrow down.</li>
            )}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-col gap-3 lg:max-h-[75vh] lg:flex-row">
          {openThreads.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {hiddenOpen.length ? "That doctor is not in this view." : "Pick a doctor on the left. You can keep up to three conversations open."}
            </div>
          ) : (
            openThreads.map((t) => (
              <div key={t.id} className="flex h-[70vh] min-w-0 flex-1 lg:h-auto">
                <ChatPane
                  thread={t}
                  queue={queue.get(t.id)}
                  notes={notes[t.id] ?? []}
                  handled={handled[t.id]}
                  ownerName={ownerName}
                  onClose={() => closeChat(t.id)}
                  onNote={(n) => setNotes(addNote(t.id, n))}
                  onHandle={(h) => onHandle(t.id, h)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
