"use client"

import { useRouter } from "next/navigation"
import { Avatar } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/lib/i18n"
import { homePath, useIdentity, type Who } from "@/lib/identity"
import { useShell } from "@/lib/shell"
import { cn } from "@/lib/utils"

/** "¿Quién eres?": first visit, and from the user card. Replaces the old "View as" switch. */
export function WhoDialog() {
  const { t } = useT()
  const shell = useShell()
  const router = useRouter()
  const { who, ready, setWho, pickerOpen, setPickerOpen } = useIdentity()

  const pick = (w: Who) => {
    setWho(w)
    setPickerOpen(false)
    router.push(homePath(w))
  }
  const same = (w: Who) => JSON.stringify(w) === JSON.stringify(who)
  const byTeam = shell.teams.map((team) => ({
    team,
    people: shell.specialists.filter((s) => s.team === team),
  }))

  return (
    <Dialog
      open={ready && pickerOpen}
      // Nobody is chosen yet: the app has nothing to show until they pick.
      onOpenChange={(open) => (open || who) && setPickerOpen(open)}
    >
      <DialogContent className="max-w-3xl" showClose={!!who} closeLabel={t("sheet.close")}>
        <DialogHeader>
          <DialogTitle>{t("who.title")}</DialogTitle>
          <DialogDescription>{t("who.body")}</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("who.specialists")}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {byTeam.map(({ team, people }) => (
              <div key={team} className="flex flex-col gap-1">
                <span className="px-1 text-xs font-medium text-muted-foreground">{team}</span>
                {people.map((s) => (
                  <Choice
                    key={s.id}
                    name={s.name}
                    line={s.id}
                    on={same({ kind: "specialist", id: s.id })}
                    onClick={() => pick({ kind: "specialist", id: s.id })}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("who.managers")}</h3>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {shell.managers.map((m) => (
                <Choice
                  key={m.team}
                  name={m.name}
                  line={t("who.manager", { team: m.team.replace("Farming ", "") })}
                  on={same({ kind: "manager", team: m.team })}
                  onClick={() => pick({ kind: "manager", team: m.team })}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("who.director.group")}</h3>
            <Choice
              name={t("who.director")}
              line={t("context.portfolio")}
              on={same({ kind: "director" })}
              onClick={() => pick({ kind: "director" })}
            />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}

function Choice({ name, line, on, onClick }: { name: string; line: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        on ? "border-primary bg-chip-green" : "border-border bg-card hover:bg-muted",
      )}
    >
      <Avatar name={name} className="size-7 text-[11px]" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{line}</span>
      </span>
    </button>
  )
}
