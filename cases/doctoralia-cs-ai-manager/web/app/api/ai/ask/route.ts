// POST /api/ai/ask: the assistant drawer (SSE). Events: status (a tool is running),
// delta / replace (the answer's text), output ({text, actions}), meta.
import { ask, AskInput } from "@/lib/ai/tasks/ask"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const b = AskInput.safeParse(await req.json().catch(() => null))
  if (!b.success) return Response.json({ error: b.error.issues }, { status: 400 })
  const enc = new TextEncoder()
  const body = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      try {
        for await (const ev of ask(b.data)) {
          if (ev.type === "done") {
            send("replace", { text: ev.output.text })
            send("output", { output: ev.output, context: ev.context })
            send("meta", ev.meta)
          } else if (ev.type === "status") send("status", { tool: ev.tool })
          else send(ev.type, { text: ev.text })
        }
      } catch {
        // ask() never throws; this guards the stream itself
      }
      ctrl.close()
    },
  })
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } })
}
