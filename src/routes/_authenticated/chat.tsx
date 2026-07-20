import { createFileRoute } from "@tanstack/react-router";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — VDNX CEO Agent" },
      {
        name: "description",
        content: "Direct conversational chat with the VDNX CEO agent.",
      },
    ],
  }),
  component: () => <ChatWorkspace />,
});
