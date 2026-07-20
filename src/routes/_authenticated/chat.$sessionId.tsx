import { createFileRoute } from "@tanstack/react-router";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export const Route = createFileRoute("/_authenticated/chat/$sessionId")({
  head: () => ({
    meta: [
      { title: "Chat — VDNX CEO Agent" },
      { name: "description", content: "VDNX CEO agent chat session." },
    ],
  }),
  component: ChatSessionPage,
});

function ChatSessionPage() {
  const { sessionId } = Route.useParams();
  // Key by sessionId so per-session state (pending, in-flight, model) is fully
  // isolated when the user switches sessions via URL/tab.
  return <ChatWorkspace key={sessionId} initialSessionId={sessionId} />;
}
