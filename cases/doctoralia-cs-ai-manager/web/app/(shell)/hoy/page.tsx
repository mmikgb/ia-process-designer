import { Suspense } from "react"
import { TodayScreen } from "@/components/screens/today"

export const metadata = { title: "Hoy · CS Control Room" }

export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <TodayScreen />
    </Suspense>
  )
}
