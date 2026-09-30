"use client"

// T4.7: the assistant drawer. ⌘J or the sidebar card opens it on any screen; it knows the
// screen and the scope, and the server answers with tools over the bundle files. Buttons
// under an answer come from the tools the model used (open the list, the doctor, start).
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { ArrowUp, ListFilter, Play, RotateCcw, Sparkles, UserRound } from "lucide-react"
import { ContextButton, Flagged, SourceBadge } from "@/components/ai/bits"
import { START_EVENT } from "@/components/shell/command-palette"
import { doctorHref } from "@/components/shell/doctor-sheet-host"
import { ASK_EVENT } from "@/components/shell/sidebar"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { refreshAiStatus, type AiMeta } from "@/lib/ai/client"
import type { AskAction, AskOutput } from "@/lib/ai/tasks/ask"
import { actorOf } from "@/lib/day"
import { useT, type Key } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { cn } from "@/lib/utils"

interface Turn {
  role: "user" | "assistant"
  content: string
  actions?: AskAction[]
  meta?: AiMeta | null
  context?: unknown
  status?: string | null
  loading?: boolean
  error?: boolean
}

const QUESTIONS: Record<string, Key[]> = {
  hoy: ["ask.q.hoy.1", "ask.q.hoy.2", "ask.q.hoy.3"],
  equipo: ["ask.q.equipo.1", "ask.q.equipo.2"],
  control: ["ask.q.control.1", "ask.q.control.2"],
  all: ["ask.q.all.1", "ask.q.all.2"],
}

/** The same lists the server suggests when the model is off, for when the server is not there. */
function offline(screen: string, scope: string): AskAction[] {
  const owner: Record<string, string> = /^S\d+$/.test(scope) ? { owner: scope } : scope.startsWith("team:") ? { team: scope.slice(5) } : {}
  const flags = screen === "hoy" ? ["may_cancel", "hollow", "followup_due"] : ["at_risk", "may_cancel", "discouraged"]
  return flags.map((flag) => ({ type: "open_list", filters: { ...owner, flag } }))
}

export function AskDrawer() {
  return (
    <Suspense fallback={null}>
      <Drawer />
    </Suspense>
  )
}

function Drawer() {
  const { t, locale } = useT()
  const { who, scope } = useIdentity()
  const path = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const screen = path.split("/")[1] || "hoy"
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState("")
  const ctrl = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement | null>(null)
  const busy = turns.some((x) => x.loading)

  useEffect(() => {
    const onAsk = () => setOpen(true)
    window.addEventListener(ASK_EVENT, onAsk)
    return () => window.removeEventListener(ASK_EVENT, onAsk)
  }, [])
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [turns])
  useEffect(() => () => ctrl.current?.abort(), [])

  const patch = (fn: (a: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), fn(ts[ts.length - 1])])

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy) return
    const history = [...turns.filter((x) => !x.error && x.content), { role: "user" as const, content: q }].map(({ role, content }) => ({ role, content }))
    setTurns((ts) => [...ts, { role: "user", content: q }, { role: "assistant", content: "", loading: true }])
    setDraft("")
    ctrl.current?.abort()
    ctrl.current = new AbortController()
    try {
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screen, scope, messages: history.slice(-12), locale, actor: actorOf(who) }),
        signal: ctrl.current.signal,
      })
      if (!r.ok || !r.body) throw new Error(String(r.status))
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const ev = /^event: (.+)$/m.exec(chunk)?.[1]
          const data = /^data: (.+)$/m.exec(chunk)?.[1]
          if (!ev || !data) continue
          const d = JSON.parse(data)
          if (ev === "status") patch((a) => ({ ...a, status: d.tool }))
          else if (ev === "delta") patch((a) => ({ ...a, status: null, content: a.content + d.text }))
          else if (ev === "replace") patch((a) => ({ ...a, content: d.text }))
          else if (ev === "output") patch((a) => ({ ...a, content: (d.output as AskOutput).text, actions: (d.output as AskOutput).actions, context: d.context }))
          else if (ev === "meta") patch((a) => ({ ...a, meta: d }))
        }
      }
      patch((a) => ({ ...a, loading: false, status: null }))
      void refreshAiStatus()
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      patch((a) => ({ ...a, loading: false, error: true, status: null, content: t("ask.error"), actions: offline(screen, scope) }))
    }
  }

  function act(a: AskAction) {
    if (a.type === "open_list") {
      setOpen(false)
      router.push(`/doctores?${new URLSearchParams(a.filters).toString()}`)
    } else if (a.type === "open_doctor") {
      setOpen(false)
      router.push(doctorHref(path, params, a.doctor_id))
    } else {
      setOpen(false)
      window.dispatchEvent(new Event(START_EVENT))
    }
  }

  function label(a: AskAction): string {
    if (a.type === "open_doctor") return t("ask.open_doctor", { name: a.name })
    if (a.type === "start_focus") return t("ask.start_focus")
    const flags = (a.filters.flag ?? "").split(",").filter(Boolean).map((f) => t(`flag.${f}` as Key))
    const head = a.count != null ? t("ask.open_list.n", { n: a.count }) : t("ask.open_list")
    const rest = [...flags, a.filters.q, a.filters.specialty, a.filters.city].filter(Boolean)
    return rest.length ? `${head} · ${rest.join(" · ")}` : head
  }

  const questions = QUESTIONS[screen] ?? QUESTIONS.all

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" closeLabel={t("sheet.close")} className="gap-0 sm:max-w-lg">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 pr-12">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base font-semibold text-foreground">{t("ask.title")}</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">{t("ask.sub")}</SheetDescription>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                ctrl.current?.abort()
                setTurns([])
              }}
              title={t("ask.clear")}
              aria-label={t("ask.clear")}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4" aria-live="polite">
          {turns.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{t("ask.try")}</p>
              {questions.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => void send(t(k))}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          )}
          {turns.map((x, k) =>
            x.role === "user" ? (
              <div key={k} className="ml-10 self-end rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                <span className="sr-only">{t("ask.you")}: </span>
                {x.content}
              </div>
            ) : (
              <div key={k} data-testid="ask-answer" className="mr-6 flex flex-col gap-2">
                {x.content ? (
                  <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", x.error ? "text-muted-foreground" : "text-foreground")}>
                    <Flagged text={x.content} numbers={x.meta?.flags.unverified_numbers ?? []} />
                  </p>
                ) : (
                  <p className="animate-pulse text-sm text-muted-foreground">{x.status ? t(`ask.tool.${x.status}` as Key) : t("ask.thinking")}</p>
                )}
                {x.content && x.status && <p className="animate-pulse text-xs text-muted-foreground">{t(`ask.tool.${x.status}` as Key)}</p>}
                {!!x.actions?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {x.actions.map((a, j) => {
                      const Icon = a.type === "open_list" ? ListFilter : a.type === "open_doctor" ? UserRound : Play
                      return (
                        <button
                          key={j}
                          type="button"
                          onClick={() => act(a)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Icon className="size-3.5" aria-hidden />
                          {label(a)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {!x.loading && x.meta && (
                  <div className="flex items-center gap-1">
                    <SourceBadge meta={x.meta} />
                    <ContextButton context={x.context} />
                  </div>
                )}
              </div>
            ),
          )}
          <div ref={end} />
        </div>

        <form
          className="flex items-end gap-2 border-t border-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={t("ask.placeholder")}
            aria-label={t("ask.placeholder")}
            className="min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label={t("ask.send")}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
