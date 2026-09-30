"use client"

import { Download, ListFilter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"

/** "Customer Success Overview" style: a 15px title with small square tools on the right. */
export function SectionHeader({
  title,
  onDownload,
  onFilter,
  children,
}: {
  title: React.ReactNode
  onDownload?: () => void
  onFilter?: () => void
  children?: React.ReactNode
}) {
  const { t } = useT()
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      <div className="flex items-center gap-2">
        {children}
        {onDownload && (
          <Button variant="outline" size="icon-sm" aria-label={t("section.download")} onClick={onDownload} className="bg-card shadow-card">
            <Download />
          </Button>
        )}
        {onFilter && (
          <Button variant="outline" size="icon-sm" aria-label={t("section.filter")} onClick={onFilter} className="bg-card shadow-card">
            <ListFilter />
          </Button>
        )}
      </div>
    </div>
  )
}
