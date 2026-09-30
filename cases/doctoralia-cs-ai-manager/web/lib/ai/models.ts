// Which model runs which task, and what it costs. Prices are src/llm.py PRICES as the
// bundle wrote them (overview.json cost.prices): one table, not a copy.
import overview from "@/data/overview.json"

export type Tier = "fast" | "deep"

export const MODELS: Record<Tier, string> = {
  fast: process.env.CS_AI_MODEL_FAST || "claude-haiku-4-5-20251001",
  deep: process.env.CS_AI_MODEL_DEEP || "claude-sonnet-5-5",
}

const PRICES = (overview as unknown as { cost: { prices: Record<string, { in: number; out: number }> } }).cost.prices

/** USD for a call: input, output, cache reads at 0.1x input, cache writes at 1.25x input. */
export function price(model: string, tin: number, tout: number, cacheRead = 0, cacheWrite = 0): number {
  const p = PRICES[model] ?? PRICES[MODELS.fast] ?? { in: 1, out: 5 }
  return (tin * p.in + tout * p.out + cacheRead * p.in * 0.1 + cacheWrite * p.in * 1.25) / 1e6
}

export function prices() {
  return PRICES
}

/** Models where the server-side refusal fallback applies (the Sonnet/Opus 5.5 family). */
export function usesFallbacks(model: string): boolean {
  return /^claude-(sonnet|opus)-5-5/.test(model)
}
