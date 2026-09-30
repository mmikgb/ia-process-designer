// Calendar arithmetic on YYYY-MM-DD strings. Pure (no imports), so node --test can run
// it and lib/dayplan.ts can share it. Noon UTC avoids daylight-saving edges.

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 864e5)
}

export function isWeekend(iso: string): boolean {
  const wd = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()
  return wd === 0 || wd === 6
}

/** n working days after `iso` (weekends skipped; holidays are not modelled). */
export function addBusinessDays(iso: string, n: number): string {
  let d = iso.slice(0, 10)
  let left = n
  while (left > 0) {
    d = addDays(d, 1)
    if (!isWeekend(d)) left--
  }
  return d
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** "25 Sep" / "25 sep", the same short form src/dayplan.py writes. */
export function shortDay(iso: string): { en: string; es: string } {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number)
  return { en: `${d} ${MONTHS_EN[m - 1]}`, es: `${d} ${MONTHS_ES[m - 1]}` }
}
