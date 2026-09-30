"use client"

// T5.1 /doctores: the list behind every count. The whole book in scope, from search.json,
// filtered by the URL (flag, signal, play, owner, team, risk_band, risk_min, specialty, city,
// q, status; status=active by default), so a count elsewhere links here and the number of
// rows is the number that was clicked. Python decided every flag, band and signal; this
// screen only picks the rows.
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Download, Search, X } from "lucide-react"
import { doctorHref } from "@/components/shell/doctor-sheet-host"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useClock } from "@/lib/clock"
import { useT, type Key } from "@/lib/i18n"
import { useIdentity } from "@/lib/identity"
import { fold, loadSearch } from "@/lib/search"
import { useShell } from "@/lib/shell"
import { FLAG_BITS, SIGNAL_BITS, type Flag, type SearchRow } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE = 100
const BAND_TONE: Record<string, string> = {
  healthy: "bg-chip-green text-chip-green-fg",
  watch: "bg-muted text-muted-foreground",
  at_risk: "bg-chip-amber text-chip-amber-fg",
  critical: "bg-chip-red text-chip-red-fg",
}

export function DoctorsScreen() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Doctors />
    </Suspense>
  )
}

/** The filters as the URL states them. Unknown values are ignored, not guessed. */
function useFilters() {
  const p = useSearchParams()
  return useMemo(() => {
    const list = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    const status = p.get("status")
    const riskMin = Number(p.get("risk_min"))
    return {
      flag: list("flag").filter((f): f is Flag => (FLAG_BITS as string[]).includes(f)),
      signal: list("signal").filter((s) => SIGNAL_BITS.includes(s)),
      play: p.get("play"),
      owner: p.get("owner"),
      team: p.get("team"),
      band: p.get("risk_band"),
      riskMin: Number.isFinite(riskMin) && p.get("risk_min") ? riskMin : null,
      specialty: p.get("specialty"),
      city: p.get("city"),
      q: p.get("q") ?? "",
      all: p.get("scope") === "all",
      status: status === "churned" || status === "all" ? status : "active",
    }
  }, [p])
}

function Doctors() {
  const { t, tx, num } = useT()
  const shell = useShell()
  const clock = useClock()
  const { who, scope } = useIdentity()
  const router = useRouter()
  const path = usePathname()
  const params = useSearchParams()
  const f = useFilters()
  const [rows, setRows] = useState<SearchRow[] | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [q, setQ] = useState(f.q)

  useEffect(() => {
    let live = true
    loadSearch()
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [])
  useEffect(() => setQ(f.q), [f.q])
  useEffect(() => setShown(PAGE), [params])

  const bands = shell.meta.risk_bands ?? []
  const teamOf = useMemo(() => new Map(shell.specialists.map((s) => [s.id, s.team])), [shell.specialists])
  const nameOf = useMemo(() => new Map(shell.specialists.map((s) => [s.id, s.name])), [shell.specialists])
  const specialist = who?.kind === "specialist" ? who.id : null

  // A specialist always sees their own book. A manager sees the URL's owner or team when it
  // names one (a count clicked elsewhere), otherwise the scope picked in the switcher.
  const book = useMemo(() => {
    if (specialist) return { owner: specialist, team: null as string | null }
    if (f.owner) return { owner: f.owner, team: null }
    if (f.team) return { owner: null, team: f.team }
    if (f.all) return { owner: null, team: null }
    if (/^S\d+$/.test(scope)) return { owner: scope, team: null }
    if (scope.startsWith("team:")) return { owner: null, team: scope.slice(5) }
    return { owner: null, team: null }
  }, [specialist, f.owner, f.team, f.all, scope])

  const filtered = useMemo(() => {
    if (!rows) return null
    const band = bands.find((b) => b.key === f.band)
    const words = fold(f.q).split(/\s+/).filter(Boolean)
    const out = rows.filter(
      (r) =>
        (f.status === "all" || r.status === f.status) &&
        (!book.owner || r.owner === book.owner) &&
        (!book.team || teamOf.get(r.owner) === book.team) &&
        f.flag.every((x) => r.flags.includes(x)) &&
        f.signal.every((x) => r.signals.includes(x)) &&
        (!f.play || r.play === f.play) &&
        (!band || (r.risk >= band.lo && r.risk < band.hi)) &&
        (f.riskMin == null || r.risk >= f.riskMin) &&
        (!f.specialty || fold(r.specialty).includes(fold(f.specialty))) &&
        (!f.city || fold(r.city).includes(fold(f.city))) &&
        (!words.length || words.every((w) => fold(`${r.name} ${r.id} ${r.specialty} ${r.city}`).includes(w))),
    )
    return out.sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name))
  }, [rows, f, book, bands, teamOf])

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k)
      else next.set(k, v)
    }
    next.delete("doctor")
    next.delete("tab")
    const s = next.toString()
    router.replace(s ? `${path}?${s}` : path, { scroll: false })
  }

  const bandOf = (risk: number) => bands.find((b) => risk >= b.lo && risk < b.hi)?.key ?? "healthy"
  const playLabel = (k: string | null) => {
    const p = k ? shell.plays.find((x) => x.key === k) : null
    return p ? tx(p.label) : t("doctors.noplay")
  }
  const contact = (d: number | null) => {
    if (d == null) return t("doctors.never")
    const n = d + clock.offset
    return n <= 0 ? t("doctors.today") : t("doctors.ago", { n })
  }
  const followup = (d: number | null): { text: string; late: boolean } | null => {
    if (d == null) return null
    const n = d - clock.offset
    if (n > 0) return { text: t("doctors.due.in", { n }), late: false }
    if (n === 0) return { text: t("doctors.due.today"), late: false }
    return { text: t("doctors.due.late", { n: -n }), late: true }
  }

  // the filters that are on, as removable chips
  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [
    ...(specialist ? [] : book.owner && f.owner ? [{ key: "owner", label: nameOf.get(book.owner) ?? book.owner, clear: { owner: null } }] : []),
    ...(specialist || !f.team ? [] : [{ key: "team", label: f.team, clear: { team: null } }]),
    ...f.flag.map((x) => ({ key: `flag:${x}`, label: t(`flag.${x}` as Key), clear: { flag: f.flag.filter((y) => y !== x).join(",") || null } })),
    ...f.signal.map((x) => ({ key: `signal:${x}`, label: t(`signal.${x}` as Key), clear: { signal: f.signal.filter((y) => y !== x).join(",") || null } })),
    ...(f.play ? [{ key: "play", label: playLabel(f.play), clear: { play: null } }] : []),
    ...(f.band ? [{ key: "band", label: t(`band.${f.band}` as Key), clear: { risk_band: null } }] : []),
    ...(f.riskMin != null ? [{ key: "risk_min", label: `${t("doctors.col.risk")} ≥ ${num(f.riskMin, 2)}`, clear: { risk_min: null } }] : []),
    ...(f.specialty ? [{ key: "specialty", label: f.specialty, clear: { specialty: null } }] : []),
    ...(f.city ? [{ key: "city", label: f.city, clear: { city: null } }] : []),
    ...(f.q ? [{ key: "q", label: t("doctors.chip.q", { q: f.q }), clear: { q: null } }] : []),
  ]

  const exportCsv = () => {
    if (!filtered) return
    const head = ["doctor_id", "doctor", "specialty", "city", "owner", "status", "play", "risk", "risk_band", "days_since_contact", "followup_in_days", "flags", "signals"]
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = filtered.map((r) =>
      [r.id, r.name, r.specialty, r.city, r.owner, r.status, r.play, r.risk, bandOf(r.risk), r.lastContact == null ? null : r.lastContact + clock.offset, r.followup == null ? null : r.followup - clock.offset, r.flags.join(" "), r.signals.join(" ")]
        .map(cell)
        .join(","),
    )
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `doctores-${clock.today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast(t("doctors.csv.done", { n: num(filtered.length) }))
  }

  const select = "h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  const owners = shell.specialists.filter((s) => !book.team || s.team === book.team)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="relative min-w-[240px] flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: q.trim() || null })
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q.trim() !== f.q && set({ q: q.trim() || null })}
            placeholder={t("doctors.search")}
            aria-label={t("doctors.search")}
            className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </form>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("doctors.filter.flag")}
          <select className={select} value={f.flag[0] ?? ""} onChange={(e) => set({ flag: e.target.value || null })}>
            <option value="">{t("doctors.filter.any")}</option>
            {FLAG_BITS.map((x) => (
              <option key={x} value={x}>
                {t(`flag.${x}` as Key)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("doctors.filter.band")}
          <select className={select} value={f.band ?? ""} onChange={(e) => set({ risk_band: e.target.value || null })}>
            <option value="">{t("doctors.filter.any")}</option>
            {bands.map((b) => (
              <option key={b.key} value={b.key}>
                {t(`band.${b.key}` as Key)}
              </option>
            ))}
          </select>
        </label>
        {!specialist && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("doctors.filter.owner")}
            <select className={select} value={f.owner ?? ""} onChange={(e) => set({ owner: e.target.value || null })}>
              <option value="">{t("doctors.filter.anyone")}</option>
              {owners.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("doctors.filter.status")}
          <select className={select} value={f.status} onChange={(e) => set({ status: e.target.value === "active" ? null : e.target.value })}>
            <option value="active">{t("doctors.status.active")}</option>
            <option value="churned">{t("doctors.status.churned")}</option>
            <option value="all">{t("doctors.status.all")}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span data-testid="doctors-count" className="mr-1 text-sm font-semibold text-foreground tabular-nums">
            {filtered == null ? "…" : filtered.length === 1 ? t("doctors.count.one") : t("doctors.count", { n: num(filtered.length) })}
          </span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => set(c.clear)}
              aria-label={t("doctors.remove", { what: c.label })}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {c.label}
              <X className="size-3" aria-hidden />
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={() => router.replace(path, { scroll: false })}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("doctors.clear")}
            </button>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered?.length}>
          <Download />
          {t("doctors.csv")}
        </Button>
      </div>

      {filtered == null ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <Card className="items-center py-12 text-sm text-muted-foreground">{t("doctors.empty")}</Card>
      ) : (
        <Card className="gap-0 overflow-x-auto py-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t("doctors.col.doctor")}</th>
                <th className="px-3 py-2.5 font-medium">{t("doctors.col.where")}</th>
                {!specialist && <th className="px-3 py-2.5 font-medium">{t("doctors.col.owner")}</th>}
                <th className="px-3 py-2.5 font-medium">{t("doctors.col.play")}</th>
                <th className="px-3 py-2.5 font-medium">{t("doctors.col.risk")}</th>
                <th className="px-3 py-2.5 font-medium">{t("doctors.col.contact")}</th>
                <th className="px-4 py-2.5 font-medium">{t("doctors.col.followup")}</th>
              </tr>
            </thead>
            <tbody data-testid="doctors-rows">
              {filtered.slice(0, shown).map((r) => {
                const band = bandOf(r.risk)
                const fu = followup(r.followup)
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(doctorHref(path, params, r.id), { scroll: false })}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        className="text-left font-medium text-foreground focus-visible:underline focus-visible:outline-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(doctorHref(path, params, r.id), { scroll: false })
                        }}
                      >
                        {r.name}
                      </button>
                      <span className="block font-mono text-[11px] text-muted-foreground">{r.id}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {r.specialty} · {r.city}
                    </td>
                    {!specialist && <td className="px-3 py-2.5 text-muted-foreground">{nameOf.get(r.owner) ?? r.owner}</td>}
                    <td className="px-3 py-2.5 text-foreground">{r.status === "churned" ? t("doctors.status.churned") : playLabel(r.play)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums", BAND_TONE[band])}>
                        {t(`band.${band}` as Key)} · {num(r.risk, 2)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{contact(r.lastContact)}</td>
                    <td className={cn("px-4 py-2.5 tabular-nums", fu?.late ? "text-warning" : "text-muted-foreground")}>{fu?.text ?? "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > shown && (
            <div className="flex justify-center border-t border-border p-3">
              <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                {t("doctors.more", { n: num(Math.min(PAGE, filtered.length - shown)) })}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  )
}
