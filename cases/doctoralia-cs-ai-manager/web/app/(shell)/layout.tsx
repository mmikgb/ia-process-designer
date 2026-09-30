import { AppShell } from "@/components/shell/app-shell"
import overview from "@/data/overview.json"
import { shellData } from "@/lib/shell-data"
import type { OverviewData } from "@/lib/types"

const data = shellData(overview as unknown as OverviewData)

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell data={data}>{children}</AppShell>
}
