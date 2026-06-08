import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, TerminalSquare, LineChart, Cpu, Send, ShieldCheck, Settings as SettingsIcon, ArrowRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ensureOwnerRole } from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "VDNX Terminal — Workspace" },
      { name: "description", content: "VDNX operations workspace: chat, terminal, budget, agents & models, outbound, approvals." },
      { property: "og:title", content: "VDNX Terminal — Workspace" },
      { property: "og:description", content: "Institutional Company Operating System." },
      { property: "og:url", content: "https://exec-suite-zen.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://exec-suite-zen.lovable.app/" }],
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
  {
    to: "/settings",
    label: "Settings",
    desc: "Connect your Gmail & LinkedIn, set your guardrail preferences.",
    icon: SettingsIcon,
    badge: "Account",
  },
] as const;

function Hub() {
  const ensureFn = useServerFn(ensureOwnerRole);
  const owner = useQuery({
    queryKey: ["ensure-owner"],
    queryFn: () => ensureFn({ data: undefined as never }),
    staleTime: Infinity,
  });

  const tiles = [
    ...TILES,
    ...(owner.data?.isOwner
      ? [
          {
            to: "/approvals",
            label: "Approvals",
            desc: "Review and approve outbound mail and LinkedIn posts.",
            icon: ShieldCheck,
            badge: "Owner",
          } as const,
        ]
      : []),
  ];

  return (
    <main className="mx-auto flex h-[calc(100vh-3.25rem)] max-w-[1200px] flex-col px-4 py-4 md:py-6">
      <div className="mb-4 md:mb-6 shrink-0">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          VDNX Workspace
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-foreground md:text-3xl">
          Choose a module
        </h1>
        <p className="mt-1 max-w-xl text-xs text-muted-foreground">
          One workspace, four surfaces. Pick where you want to operate.
        </p>
      </div>

      <div className="grid flex-1 min-h-0 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map(({ to, label, desc, icon: Icon, badge }) => (
          <Link
            key={to}
            to={to as any}
            className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-panel p-4 transition hover:border-primary/40 hover:bg-panel-2"
          >
            <div className="flex items-start justify-between">
              <Icon className="h-5 w-5 text-primary" />
              <span className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {badge}
              </span>
            </div>
            <h2 className="mt-3 font-serif text-lg font-semibold text-foreground">
              {label}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{desc}</p>
            <div className="mt-auto pt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition group-hover:opacity-100">
              Open <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
