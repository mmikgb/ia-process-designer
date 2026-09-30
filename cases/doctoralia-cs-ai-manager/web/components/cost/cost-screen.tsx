import { CheckCircle2, PowerOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { OverviewData } from "@/lib/types"

const usd = (v: number) => (v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`)
const n = (v: number) => v.toLocaleString("en-US")

export function CostScreen({ data }: { data: OverviewData }) {
  const { cost } = data
  const e = cost.estimate
  const dedupe = cost.notes_total && e.unique_notes_all ? cost.notes_total / e.unique_notes_all : null

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">What does the AI cost, and is it worth it?</h2>
        {cost.enabled ? (
          <p className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            AI features are on for this build.
          </p>
        ) : (
          <p className="flex max-w-3xl items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground text-pretty">
            <PowerOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium">AI is off</span> ({cost.reason.toLowerCase()}). Every screen you have seen was
              built without a model call: scores, limits, lead times and drafts are deterministic. The model is an optional
              polish, never a dependency.
            </span>
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Full enrichment, one-off", value: usd(e.total_usd), hint: "themes + every doctor summary, batched" },
          {
            label: "Per farming specialist",
            value: usd(e.total_usd / Math.max(cost.farming_specialists, 1)),
            hint: `the same bake split over ${cost.farming_specialists} specialists`,
          },
          {
            label: "Monthly budget cap",
            value: cost.monthly_budget_usd != null ? usd(cost.monthly_budget_usd) : "—",
            hint: "at 100% calls stop and the deterministic path takes over",
          },
        ].map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardContent className="flex flex-col gap-1 px-4">
              <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
              <span className="text-3xl font-semibold tabular-nums text-foreground">{k.value}</span>
              <span className="text-xs text-muted-foreground text-pretty">{k.hint}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What a full enrichment would cost</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Job</th>
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 text-right font-medium">Tokens in</th>
                <th className="py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 pr-3 text-foreground">Theme discovery (batch)</td>
                <td className="py-2 pr-3 text-muted-foreground">{n(e.unique_notes_all)} unique notes</td>
                <td className="py-2 pr-3 text-right">{n(e.tokens_all)}</td>
                <td className="py-2 text-right">{usd(e.themes_usd)}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-3 text-foreground">Doctor summaries (batch)</td>
                <td className="py-2 pr-3 text-muted-foreground">{n(e.summaries_doctors)} active doctors</td>
                <td className="py-2 pr-3 text-right">—</td>
                <td className="py-2 text-right">{usd(e.summaries_usd)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold text-foreground">Total, one-off bake</td>
                <td />
                <td />
                <td className="py-2 text-right font-semibold text-foreground">{usd(e.total_usd)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>The three decisions that are the whole cost answer</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
              <li className="text-pretty">
                <span className="font-medium">Dedupe before sending.</span>{" "}
                {cost.notes_total != null && (
                  <>
                    {n(cost.notes_total)} notes are {n(e.unique_notes_all)} unique strings
                    {dedupe != null && `, about ${Math.round(dedupe)}× fewer to send`}.
                  </>
                )}
              </li>
              <li className="text-pretty">
                <span className="font-medium">Batch.</span> Batch calls cost {Math.round(cost.batch_discount * 100)}% of the
                live price; nothing here needs an answer in seconds.
              </li>
              <li className="text-pretty">
                <span className="font-medium">Recompute only what changed.</span> The nightly job summarises doctors with a
                new note, not the whole book.
              </li>
            </ol>
            <p className="pt-3 text-xs text-muted-foreground text-pretty">
              Nothing that produces a risk score, a forecast, a control limit or a ranking goes through a model. Those stay
              deterministic so every number can be taken apart.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prices used, per million tokens</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Model</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Input</th>
                  <th className="py-1.5 text-right font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cost.prices).map(([m, p]) => (
                  <tr key={m} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs text-foreground">{m}</td>
                    <td className="py-1.5 pr-3 text-right">{usd(p.in)}</td>
                    <td className="py-1.5 text-right">{usd(p.out)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground text-pretty">
              From <span className="font-mono">llm.py</span>. Live spend by task and by specialist is recorded in{" "}
              <span className="font-mono">out/llm_ledger.db</span> on the machine that makes the calls, and shown on the
              Streamlit Cost screen.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground text-pretty">
        <span className="font-medium">The model is not the cost. Specialist time is.</span> If this saves{" "}
        {cost.farming_specialists} specialists twenty minutes a day, the arithmetic is not close — and the ledger makes that
        a measurement rather than a claim.
      </p>
    </>
  )
}
