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
  return tokens(text).map((t) => t.token)
}

function tokens(text: string): { token: string; at: number }[] {
  return [...text.matchAll(NUM)].filter((m) => /\d/.test(m[0])).map((m) => ({ token: m[0].trim(), at: m.index ?? 0 }))
}

const MONTH = "ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?|jan(?:uary)?|february|march|april|june|july|aug(?:ust)?|september|october|november|dec(?:ember)?"
const WEEKDAY = "lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
const DATE_AFTER = new RegExp(`^\\s*(?:de\\s+)?(?:${MONTH})\\b`, "i")
const DATE_BEFORE = new RegExp(`(?:\\b(?:${WEEKDAY}|${MONTH})\\.?|\\bel)\\s*$`, "i")

/** Is the number at `at` written as part of a date ("el 7 de septiembre", "lunes 28", "Sep 7")? */
function inDate(text: string, at: number, token: string): boolean {
  const before = text.slice(Math.max(0, at - 14), at)
  const after = text.slice(at + token.length, at + token.length + 16)
  return DATE_AFTER.test(after) || (DATE_BEFORE.test(before) && DATE_AFTER.test(after)) || new RegExp(`\\b(?:${WEEKDAY}|${MONTH})\\.?\\s*$`, "i").test(before)
}

export interface Allowed {
  values: number[]
  /** a date's day and month: they only justify a number written as a date */
  dateParts: number[]
}

/**
 * Every number the output may use: all numbers in the context (walked recursively,
 * including numbers written inside its strings), plus their usual renderings (0.358 →
 * 36%, 35.8%; 12.0 → 12), a date's year, and what the specialist typed. A date's day and
 * month count only where the output writes a date. Counts in the prompt are not here.
 */
export function allowedNumbers(context: unknown, extraText: string[] = []): Allowed {
  const values = new Set<number>()
  const dateParts = new Set<number>()
  const add = (n: number) => Number.isFinite(n) && values.add(n)
  const fromText = (s: string) => {
    const dates = [...s.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)]
    for (const d of dates) {
      add(Number(d[1]))
      dateParts.add(Number(d[2]))
      dateParts.add(Number(d[3]))
    }
    const rest = s.replace(/\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?/g, " ")
    for (const tok of numbersIn(rest)) for (const v of readings(tok).values) add(v)
  }
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v)
    else if (typeof v === "string") fromText(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === "object") Object.values(v).forEach(walk)
  }
  walk(context)
  extraText.forEach(fromText)
  return { values: [...values], dateParts: [...dateParts] }
}

function matches(c: number, a: number, decimals: boolean): boolean {
  return decimals || !Number.isInteger(c)
    ? Math.abs(c - a) <= 0.051 // 35.8 vs 35.77
    : Math.round(a) === c || Math.abs(c - a) < 1e-9 // "36" may round 35.8
}

function known(token: string, allowed: Allowed, date: boolean): boolean {
  const r = readings(token)
  return r.values.some((v) => {
    // "36%" may be the share 0.358 or the value 36; "35.8" the share 0.358 as a percent
    const candidates = r.percent ? [v, v / 100] : [v]
    const hit = candidates.some((c) => allowed.values.some((a) => matches(c, a, r.decimals)))
    const shareAsPercent = !r.percent && r.decimals && allowed.values.some((a) => Math.abs(a) <= 1 && matches(v, a * 100, true))
    return hit || shareAsPercent || (date && Number.isInteger(v) && allowed.dateParts.includes(v))
  })
}

export function guard(output: string, context: unknown, extraText: string[] = []): GuardFlags {
  const allowed = allowedNumbers(context, extraText)
  const bad = tokens(output)
    .filter(({ token, at }) => !known(token, allowed, inDate(output, at, token)))
    .map((t) => t.token)
  const text = fold(output)
  const banned = BANNED.filter((p) => text.includes(fold(p)))
  return { unverified_numbers: [...new Set(bad)], banned_phrases: [...new Set(banned.map(fold))] }
}
