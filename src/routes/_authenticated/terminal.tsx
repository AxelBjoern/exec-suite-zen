import { createFileRoute, redirect } from "@tanstack/react-router";
import { Terminal } from "@/components/Terminal";
import { Toaster } from "@/components/ui/sonner";
import { isVdnxOwnerEmail } from "@/lib/vdnx";

export const Route = createFileRoute("/_authenticated/terminal")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { email?: string | null } }).user;
    if (!isVdnxOwnerEmail(user?.email)) {
      throw redirect({ to: "/chat" });
    }
  },
  head: () => ({
    meta: [
      { title: "VDNX Terminal — Authority · Auditability · Atomicity" },
      { name: "description", content: "Operate the VDNX executive team via the institutional command terminal." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <Terminal />
      <Toaster theme="dark" position="top-right" />
    </>
  );
}
