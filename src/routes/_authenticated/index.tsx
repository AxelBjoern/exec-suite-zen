import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, TerminalSquare, LineChart, Cpu, Send, ShieldCheck, ArrowRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ensureOwnerRole } from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "VDNX — Workspace" },
      { name: "description", content: "Neutral start hub for the VDNX workspace." },
    ],
  }),
  component: Hub,
});

const TILES = [
  {
    to: "/chat",
    label: "Chat",
    desc: "Free-form conversation with the executive board.",
    icon: MessageSquare,
    badge: "Live",
  },
  {
    to: "/terminal",
    label: "Terminal",
    desc: "Command the executive agents with structured verbs.",
    icon: TerminalSquare,
    badge: "Live",
  },
  {
    to: "/budget",
    label: "Budget",
    desc: "Scenario modelling, P&L, cash flow, sensitivity.",
    icon: LineChart,
    badge: "Module",
  },
  {
    to: "/forge",
    label: "Forge",
    desc: "Train and deploy specialised agents on OpenRouter models.",
    icon: Cpu,
    badge: "Module",
  },
  {
    to: "/outbound",
    label: "Outbound",
    desc: "Send email, self-reminders, and LinkedIn posts from the board.",
    icon: Send,
    badge: "Live",
  },
] as const;

function Hub() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12 md:py-20">
      <div className="mb-10 md:mb-14">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          VDNX Workspace
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground md:text-5xl">
          Choose a module
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          One workspace, four surfaces. Pick where you want to operate.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TILES.map(({ to, label, desc, icon: Icon, badge }) => (
          <Link
            key={to}
            to={to as any}
            className="group relative overflow-hidden rounded-lg border border-border bg-panel p-6 transition hover:border-primary/40 hover:bg-panel-2"
          >
            <div className="flex items-start justify-between">
              <Icon className="h-7 w-7 text-primary" />
              <span className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {badge}
              </span>
            </div>
            <h2 className="mt-5 font-serif text-2xl font-semibold text-foreground">
              {label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
              Open <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
