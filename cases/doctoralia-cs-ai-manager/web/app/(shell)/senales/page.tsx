import { SimpleScreen } from "@/components/screens/simple"

export const metadata = { title: "Señales · CS Control Room" }

export default function SignalsPage() {
  return <SimpleScreen title="nav.signals" subtitle="signals.subtitle" phase={5} />
}
