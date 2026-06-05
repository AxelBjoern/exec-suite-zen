import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "@/components/Terminal";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/terminal")({
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
