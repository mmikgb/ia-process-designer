"use client"

// T4.2: the doctor analysis in the sheet, and its three-line summary in focus mode.
import { useEffect } from "react"
import { Sparkles } from "lucide-react"
import { ContextButton, Flagged, RegenerateButton, SourceBadge } from "@/components/ai/bits"
import { aiUsed } from "@/components/today/outcome-menu"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAiJson } from "@/lib/ai/client"
import { actorOf } from "@/lib/day"
import { useT } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"

interface Analysis {
  what_happened: string[]
  what_they_want: string
  promises_open: { who: "doctor" | "specialist"; what: string; since: string }[]
  likely_cause: string
  next_step: string
  questions_for_call: string[]
  evidence: { claim_index: number; source: string; date: string }[]
}

export function DoctorAnalysis({ doctorId }: { doctorId: string }) {
  const { t, locale, day } = useT()
  const { who } = useIdentity()
  const ai = useAiJson<Analysis>("/api/ai/doctor")
  const run = (refresh = false) => {
    const used = aiUsed.get(doctorId) ?? new Set<string>()
    aiUsed.set(doctorId, used.add("doctor"))
    void ai.run({ doctor_id: doctorId, locale, actor: actorOf(who), refresh })
  }
  // a saved analysis shows up without asking
  useEffect(() => {
    ai.reset()
    void ai.run({ doctor_id: doctorId, locale, cache_only: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, locale])
  const a = ai.output
  const empty = !a || ai.meta?.source === "fallback:not_cached"
  const nums = ai.meta?.flags.unverified_numbers ?? []
  const F = ({ s }: { s: string }) => <Flagged text={s} numbers={nums} />

  if (ai.loading && empty)
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <p className="text-sm text-muted-foreground">{t("an.loading")}</p>
        <Skeleton className="h-20" />
        <Skeleton className="h-12" />
        <Skeleton className="h-16" />
      </div>
    )
  if (empty)
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-5">
        <p className="text-sm text-muted-foreground">{t("an.body")}</p>
        <Button onClick={() => run()}>
          <Sparkles />
          {t("an.run")}
        </Button>
        {ai.error && <p className="text-sm text-destructive">{t("ai.error")}</p>}
      </div>
    )
  const ev = (k: number) => a!.evidence.filter((e) => e.claim_index === k)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge meta={ai.meta} />
        <span className="ml-auto flex items-center gap-1">
          <ContextButton context={ai.context} />
          <RegenerateButton onClick={() => run(true)} disabled={ai.loading} />
        </span>
      </div>
      <Section title={t("an.what_happened")}>
        {a!.what_happened.length ? (
          <ul className="flex flex-col gap-1.5">
            {a!.what_happened.map((s, k) => (
              <li key={k} className="text-sm text-foreground">
                · <F s={s} />
                {ev(k).map((e, j) => (
                  <span key={j} className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {e.source} · {day(e.date)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("an.none")}</p>
        )}
      </Section>
      <Section title={t("an.what_they_want")}>
        <p className="text-sm text-foreground">
          <F s={a!.what_they_want || t("an.none")} />
        </p>
      </Section>
      <Section title={t("an.promises")}>
        {a!.promises_open.length ? (
          <ul className="flex flex-col gap-1.5 text-sm text-foreground">
            {a!.promises_open.map((p, k) => (
              <li key={k}>
                · <span className="font-medium">{t(p.who === "doctor" ? "an.promise.doctor" : "an.promise.specialist")}:</span> <F s={p.what} />{" "}
                <span className="text-xs text-muted-foreground">{t("an.since", { date: day(p.since) })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("an.none")}</p>
        )}
      </Section>
      <Section title={t("an.cause")} tag={a!.likely_cause ? t("an.hypothesis") : undefined}>
        <p className="text-sm text-foreground">{a!.likely_cause ? <F s={a!.likely_cause} /> : <span className="text-muted-foreground">{t("an.no_hypothesis")}</span>}</p>
      </Section>
      <Section title={t("an.next")}>
        <p className="text-sm font-medium text-foreground">
          <F s={a!.next_step} />
        </p>
      </Section>
      {a!.questions_for_call.length > 0 && (
        <Section title={t("an.questions")}>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground">
            {a!.questions_for_call.map((q, k) => (
              <li key={k}>
                <F s={q} />
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}

function Section({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
        {tag && <span className="rounded-full bg-chip-amber px-2 py-0.5 text-[10px] tracking-normal text-chip-amber-fg normal-case">{tag}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Focus mode: the saved analysis in three lines, if there is one. Never calls the model. */
export function AnalysisSummary({ doctorId }: { doctorId: string }) {
  const { t, locale } = useT()
  const ai = useAiJson<Analysis>("/api/ai/doctor")
  useEffect(() => {
    void ai.run({ doctor_id: doctorId, locale, cache_only: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, locale])
  const a = ai.output
  if (!a || !ai.meta || ai.meta.source.startsWith("fallback")) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("focus.analysis")}.</span> {t("an.body")}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {t("an.summary")}
        <SourceBadge meta={ai.meta} />
      </span>
      <p className="text-foreground">{a.what_they_want}</p>
      {a.likely_cause && <p className="text-muted-foreground">{a.likely_cause}</p>}
      <p className="font-medium text-foreground">{a.next_step}</p>
    </div>
  )
}
