// The model never produces a number. Every number in an AI output must be in the
// context it was given (or typed by the specialist); anything else is flagged, and a
// message to a doctor with a new number is rejected. Pure: node --test runs it.

export interface GuardFlags {
  unverified_numbers: string[]
  banned_phrases: string[]
}

// Integers, decimals with . or , , thousands separators, percentages. Not part of a
// word or an id: "D03810", "S01", "C4" and "claude-sonnet-5-5" are skipped.
const NUM = /(?<![\p{L}\d_-])[-+]?\d+(?:[.,]\d+)*(?:\s?%)?(?![\p{L}\d_])/gu

export const BANNED = ["garantizo", "le aseguro", "te aseguro", "sin costo", "gratis", "mas pacientes seguro", "más pacientes seguro"]

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Every value a written number could mean: "1,499" is 1499 (thousands) or 1.499 (decimal comma). */
export function readings(token: string): { values: number[]; decimals: boolean; percent: boolean } {
  const percent = token.includes("%")
  const t = token.replace(/[%\s]/g, "")
  const values = new Set<number>()
  let decimals = false
  if (/^[-+]?\d{1,3}(?:[.,]\d{3})+$/.test(t)) {
    values.add(Number(t.replace(/[.,]/g, ""))) // thousands
    if (/^[-+]?\d{1,3}[.,]\d{3}$/.test(t)) {
      values.add(Number(t.replace(",", "."))) // or a decimal with three places
      decimals = true
    }
  } else if (/^[-+]?\d+[.,]\d+$/.test(t)) {
    values.add(Number(t.replace(",", ".")))
    decimals = true
  } else {
    const v = Number(t.replace(/[.,]/g, ""))
    if (Number.isFinite(v)) values.add(v)
  }
  return { values: [...values].filter(Number.isFinite), decimals, percent }
}

export function numbersIn(text: string): string[] {
  return [...text.matchAll(NUM)].map((m) => m[0].trim()).filter((s) => /\d/.test(s))
}

/**
 * Every number the output may use: all numbers in the context (walked recursively,
 * including numbers written inside its strings), plus their usual renderings (0.358 →
 * 36%, 35.8%; 12.0 → 12; a date's year, month and day). Counts in the prompt itself
 * are not here on purpose.
 */
export function allowedNumbers(context: unknown, extraText: string[] = []): number[] {
  const out = new Set<number>()
  const add = (n: number) => {
    if (!Number.isFinite(n)) return
    out.add(n)
    if (Math.abs(n) <= 1 && n !== 0) out.add(Math.round(n * 1000) / 10) // share → percent
    if (Math.abs(n) > 1 && Math.abs(n) < 100) out.add(n / 100) // percent → share
  }
  const fromText = (s: string) => {
    for (const d of s.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
      add(Number(d[1]))
      add(Number(d[2]))
      add(Number(d[3]))
    }
    for (const tok of numbersIn(s)) for (const v of readings(tok).values) add(v)
  }
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v)
    else if (typeof v === "string") fromText(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === "object") Object.values(v).forEach(walk)
  }
  walk(context)
  extraText.forEach(fromText)
  return [...out]
}

function known(token: string, allowed: number[]): boolean {
  const r = readings(token)
  return r.values.some((v) => {
    const candidates = r.percent ? [v, v / 100] : [v]
    return candidates.some((c) =>
      allowed.some((a) =>
        r.decimals || !Number.isInteger(c)
          ? Math.abs(c - a) <= 0.051 // 35.8 vs 35.77
          : Math.round(a) === c || Math.abs(c - a) < 1e-9, // "36" may round 35.8
      ),
    )
  })
}

export function guard(output: string, context: unknown, extraText: string[] = []): GuardFlags {
  const allowed = allowedNumbers(context, extraText)
  const unverified = [...new Set(numbersIn(output).filter((tok) => !known(tok, allowed)))]
  const text = fold(output)
  const banned = BANNED.filter((p) => text.includes(fold(p)))
  return { unverified_numbers: unverified, banned_phrases: [...new Set(banned.map(fold))] }
}
