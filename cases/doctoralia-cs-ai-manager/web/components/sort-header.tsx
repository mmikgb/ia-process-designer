"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

export type Dir = "asc" | "desc"

/**
 * A column header that sorts its table. First click sorts the way people usually
 * want that column (highest first for numbers, A–Z for text); the next click flips it.
 */
export function SortTh<K extends string>({
  label,
  k,
  sortKey,
  dir,
  onSort,
  firstDir = "desc",
  align = "left",
  className,
  title,
}: {
  label: React.ReactNode
  k: K
  sortKey: K
  dir: Dir
  onSort: (k: K, dir: Dir) => void
  firstDir?: Dir
  align?: "left" | "right"
  className?: string
  title?: string
}) {
  const active = sortKey === k
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("py-2 pr-3 font-medium", align === "right" && "text-right", className)}
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(k, active ? (dir === "asc" ? "desc" : "asc") : firstDir)}
        className={cn(
          "inline-flex items-center gap-1 rounded text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-50")} aria-hidden />
      </button>
    </th>
  )
}

type Val = number | string | boolean | null | undefined

/** Sort state plus a sorted copy of rows. Missing values always go last. */
export function useSorted<T, K extends string>(
  rows: T[],
  get: (row: T, k: K) => Val,
  initial: { key: K; dir: Dir },
) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const x = get(a, sort.key)
      const y = get(b, sort.key)
      const nx = x == null || x === ""
      const ny = y == null || y === ""
      if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1
      const r =
        typeof x === "string" ? x.localeCompare(String(y), "es") : Number(x) - Number(y)
      return sort.dir === "asc" ? r : -r
    })
    return out
    // get is expected to be stable in meaning; rows and sort drive the result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  return { sorted, sortKey: sort.key, dir: sort.dir, onSort: (key: K, dir: Dir) => setSort({ key, dir }) }
}
