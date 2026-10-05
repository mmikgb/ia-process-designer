import { ConversationsScreen } from "@/components/conversations/conversations-screen"
import { Framed } from "@/components/screens/simple"

export const metadata = { title: "Conversaciones · CS Control Room" }

export default function ConversationsPage() {
  return (
    <Framed title="nav.conversations" subtitle="conversations.subtitle">
      <ConversationsScreen />
    </Framed>
  )
}
