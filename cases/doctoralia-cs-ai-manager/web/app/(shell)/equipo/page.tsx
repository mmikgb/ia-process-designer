import { TeamScreen } from "@/components/team/team-screen"
import { Framed } from "@/components/screens/simple"
import { ManagersOnly } from "@/components/shell/managers-only"
import overview from "@/data/overview.json"
import type { OverviewData } from "@/lib/types"

const data = overview as unknown as OverviewData

export const metadata = { title: "Mi equipo · CS Control Room" }

export default function Page() {
  return (
    <Framed title="nav.team" subtitle="team.subtitle">
      <ManagersOnly>
        <TeamScreen team={data.team} teams={data.teams} rules={data.rules} />
      </ManagersOnly>
    </Framed>
  )
}
