// A bundle string is plain text or {en, es}. tx() picks the side to show.
// Components use useT().tx, which binds the current locale (lib/i18n).
export type I18n = { en: string; es: string }
export type Text = string | I18n

export type Locale = "en" | "es"

export function tx(value: Text | null | undefined, locale: Locale = "en"): string {
  if (value == null) return ""
  return typeof value === "string" ? value : value[locale]
}
