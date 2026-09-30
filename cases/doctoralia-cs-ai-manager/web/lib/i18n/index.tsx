"use client"

// No i18n library: two flat dictionaries, one provider, Intl for numbers and dates.
// The locale lives in localStorage ("cs:locale", default "es") and on <html lang>.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { en } from "./en"
import { es, type Key } from "./es"
import { tx as txRaw, type Locale, type Text } from "@/lib/tx"

const DICTS: Record<Locale, Record<Key, string>> = { es, en }
const STORE = "cs:locale"
const INTL: Record<Locale, string> = { es: "es-MX", en: "en-US" }

export type Vars = Record<string, string | number>

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: Key, vars?: Vars) => string
  tx: (v: Text | null | undefined) => string
  num: (v: number, digits?: number) => string
  pct: (v: number, digits?: number) => string
  /** "25 sep" / "Sep 25" */
  day: (iso: string) => string
  /** "viernes 25 de septiembre" / "Friday, September 25" */
  dayLong: (iso: string) => string
}

// Parse YYYY-MM-DD at noon so no timezone moves the day.
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`)

function make(locale: Locale, setLocale: (l: Locale) => void): I18n {
  const dict = DICTS[locale]
  const tag = INTL[locale]
  const short = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" })
  const long = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long" })
  return {
    locale,
    setLocale,
    t: (key, vars) => interpolate(dict[key] ?? key, vars),
    tx: (v) => txRaw(v, locale),
    num: (v, digits = 0) =>
      new Intl.NumberFormat(tag, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v),
    pct: (v, digits = 0) =>
      new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v),
    day: (iso) => short.format(at(iso)).replace(".", ""),
    dayLong: (iso) => long.format(at(iso)),
  }
}

const Ctx = createContext<I18n>(make("es", () => {}))

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setState] = useState<Locale>("es")

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE)
      if (saved === "en" || saved === "es") setState(saved)
    } catch {
      // storage blocked: Spanish, the default
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === "es" ? "es-MX" : "en"
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setState(l)
    try {
      window.localStorage.setItem(STORE, l)
    } catch {
      // the choice still holds for this page
    }
  }, [])

  const value = useMemo(() => make(locale, setLocale), [locale, setLocale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useT(): I18n {
  return useContext(Ctx)
}

export type { Key, Locale, Text }
