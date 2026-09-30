/**
 * Formats a number using a Python-style format spec found in overview.json,
 * e.g. "{:.0%}", "{:.1%}", "{:.1f}", "{:,.0f}".
 */
export function pyFormat(value: number, fmt: string): string {
  const match = fmt.match(/\{:(,)?\.(\d+)(f|%)\}/)
  if (!match) return String(value)
  const [, comma, decimalsStr, type] = match
  const decimals = Number(decimalsStr)

  if (type === "%") {
    return `${(value * 100).toFixed(decimals)}%`
  }

  const fixed = value.toFixed(decimals)
  if (!comma) return fixed

  const [intPart, decPart] = fixed.split(".")
  const withCommas = Number(intPart).toLocaleString("en-US")
  return decPart ? `${withCommas}.${decPart}` : withCommas
}

/** Formats a fractional delta (e.g. 0.0728) as a signed percent string, e.g. "+7.3%". */
export function formatDeltaPct(deltaPct: number): string {
  const pct = deltaPct * 100
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

/**
 * Decides whether an increase/decrease is "good" (green) or "bad" (red)
 * based on the metric's `good` direction.
 *   good = "up"   -> increase is good (green), decrease is bad (red)
 *   good = "down" -> increase is bad (red), decrease is good (green)
 */
export function isGoodDelta(deltaPct: number, good: "up" | "down"): boolean {
  const isIncrease = deltaPct > 0
  return good === "up" ? isIncrease : !isIncrease
}

/** Extracts the week's start date, e.g. "2026-03-16/2026-03-22" -> Date for 2026-03-16. */
export function weekStartDate(week: string): Date {
  const start = week.split("/")[0]
  return new Date(`${start}T00:00:00`)
}

/** Formats a week's start date as "Mar 16". */
export function formatWeekShort(week: string): string {
  return weekStartDate(week).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** Formats a percent value (0-1) with a given number of decimals, e.g. 0.229 -> "22.9%". */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}
