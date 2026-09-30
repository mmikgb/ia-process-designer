"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { addBusinessDays, addDays } from "@/lib/dates"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** "Acordamos…": when do you pick it up (+2 working days, +1 week, a date) and a note. */
export function AgreedDialog({
  open,
  onOpenChange,
  today,
  name,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  today: string
  name: string
  onSave: (nextDue: string, note: string) => void
}) {
  const { t, day } = useT()
  const plus2 = addBusinessDays(today, 2)
  const week = addDays(today, 7)
  const [due, setDue] = useState(plus2)
  const [note, setNote] = useState("")
  useEffect(() => {
    if (open) {
      setDue(plus2)
      setNote("")
    }
  }, [open, plus2])
  const choice = (d: string, label: string) => (
    <button
      type="button"
      onClick={() => setDue(d)}
      aria-pressed={due === d}
      className={cn(
        "flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        due === d ? "border-primary bg-chip-green text-foreground" : "border-border hover:bg-muted",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{day(d)}</span>
    </button>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t("sheet.close")}>
        <DialogHeader>
          <DialogTitle>{t("outcome.agreed.title")}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {choice(plus2, t("outcome.plus2"))}
          {choice(week, t("outcome.plus_week"))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">{t("outcome.pick")}</span>
          <input
            type="date"
            min={addDays(today, 1)}
            value={due}
            onChange={(e) => e.target.value && setDue(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">{t("outcome.note")}</span>
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSave(due, note.trim())}>{t("outcome.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
