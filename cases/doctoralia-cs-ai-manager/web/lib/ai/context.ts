// Grounded context for the model, built from the same bundle files the browser reads.
// Minimal: only the fields a task needs, plus a rules block and a definitions block so
// the model explains with the operation's own definitions. Server-only.
import { readFile } from "node:fs/promises"
import path from "node:path"
import overview from "@/data/overview.json"
import { PUBLIC } from "@/lib/server/paths"
import type { Dossier, OverviewData, QueueFile, SearchRow, SearchRowRaw } from "@/lib/types"
import { searchRow } from "@/lib/types"

export const O = overview as unknown as OverviewData

const json = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(path.join(PUBLIC, file), "utf8")) as T

let search: Promise<SearchRow[]> | null = null
export function searchIndex(): Promise<SearchRow[]> {
  search ??= json<SearchRowRaw[]>("search.json").then((rows) => rows.map(searchRow))
  return search
}

const books = new Map<string, Promise<Map<string, Dossier>>>()
export function book(owner: string): Promise<Map<string, Dossier>> {
  let b = books.get(owner)
  if (!b) {
    b = json<Dossier[]>(`doctors/${owner}.json`).then((rows) => new Map(rows.map((d) => [d.doctor_id, d])))
    books.set(owner, b)
  }
  return b
}

export async function dossier(doctorId: string): Promise<Dossier | null> {
  const row = (await searchIndex()).find((r) => r.id === doctorId)
  if (!row) return null
  return (await book(row.owner)).get(doctorId) ?? null
}

export function queue(owner: string): Promise<QueueFile | null> {
  return json<QueueFile>(`queue/${owner}.json`).catch(() => null)
}

export function specialistName(id: string): string {
  return O.specialists.find((s) => s.id === id)?.name ?? id
}

export const RULES = () => ({ ...O.rules })

export const DEFINITIONS = {
  risk_score: "0 a 1, suma de reglas con peso según el aumento de cancelación medido (LIFT); no es un modelo",
  lead_time: "días típicos entre la primera nota de alerta y la cancelación, medidos en quienes ya cancelaron",
  grade: "calificación de cierre del onboarding (A a D); D cancela mucho más",
  peer_median: "mediana de citas al mes de doctores de la misma especialidad y ciudad",
  play: "la jugada del copiloto para este doctor, en orden de PLAYS",
}

/** The facts about one doctor a message or an analysis may use. */
export function doctorFacts(d: Dossier) {
  return {
    id: d.doctor_id,
    name: d.doctor_name,
    specialty: d.specialty,
    city: d.city,
    status: d.status,
    signup_date: d.signup_date,
    onboarding_grade: d.onboarding_grade,
    onboarding_score: d.onboarding_score,
    calendar_enabled: d.calendar_enabled,
    weekly_slots_published: d.weekly_slots_published,
    bookings_avg: d.bookings_avg,
    bookings_last: d.bookings_last,
    bookings_prev: d.bookings_prev,
    peer_median: d.median_specialty_city,
    days_since_contact: d.days_since_contact,
    risk_score: d.risk_score,
    owner: specialistName(d.owner_specialist_id),
  }
}

/** A scope's KPI block (30 days), in one language, with n and suppression. */
export function kpiBlock(scope: string, locale: "es" | "en") {
  const periods = (O.scopes[scope] ?? O.scopes.all).periods
  const k = periods["30"] ?? Object.values(periods)[0]
  const tx = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, string>)[locale] : (v as string))
  return {
    window_days: k.window_days,
    asof: k.asof,
    health_score: k.health_score,
    totals: k.totals,
    kpis: k.kpis.map((x) => ({
      key: x.key,
      label: tx(x.label),
      value: x.value,
      prev: x.prev,
      delta_pct: x.delta_pct,
      n: x.n,
      suppressed: x.suppressed ? tx(x.suppressed) : undefined,
      note: tx(x.note),
      good_direction: x.good,
    })),
  }
}

/**
 * The control charts, cut to what a manager briefing needs: centre, the last limits and
 * the signals in the last 28 days. "real" only when a signal is there.
 */
export function spcSummary(asof: string, locale: "es" | "en" = "es") {
  const tx = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, string>)[locale] : (v as string))
  const since = new Date(Date.parse(`${asof}T12:00:00Z`) - 28 * 864e5).toISOString().slice(0, 10)
  return Object.entries(O.spc).map(([key, c]) => {
    const recent = c.points.filter((p) => p.period >= since)
    const last = c.points[c.points.length - 1]
    const signals = recent.filter((p) => p.signals.length).map((p) => ({ period: p.period, value: p.value, rules: p.signals }))
    return {
      key,
      label: tx(c.label),
      center: c.center,
      last: last ? { period: last.period, value: last.value, ucl: last.ucl, lcl: last.lcl } : null,
      signals_last_28_days: signals,
      verdict: signals.length ? "signal" : "normal_variation",
      baseline_stable: c.stability.stable,
    }
  })
}
