import { DoctorsScreen } from "@/components/doctors/doctors-screen"
import { Framed } from "@/components/screens/simple"

export const metadata = { title: "Doctores · CS Control Room" }

export default function DoctorsPage() {
  return (
    <Framed title="nav.doctors" subtitle="doctors.subtitle">
      <DoctorsScreen />
    </Framed>
  )
}
