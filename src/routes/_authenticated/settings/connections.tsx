import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Mail, Linkedin, CheckCircle2, XCircle } from "lucide-react";
import { getConnectorStatus } from "@/lib/connections.functions";

export const Route = createFileRoute("/_authenticated/settings/connections")({
  head: () => ({
    meta: [
      { title: "VDNX — Connections" },
      { name: "description", content: "Gmail and LinkedIn workspace connectors managed via Lovable Connectors." },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const statusFn = useServerFn(getConnectorStatus);
  const { data, isLoading } = useQuery({ queryKey: ["connector-status"], queryFn: () => statusFn() });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Settings · Connections</p>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Workspace connectors</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Gmail and LinkedIn are connected once at the workspace level through Lovable Connectors. All outbound email and posts use these connections — there is no per-user sign-in.
      </p>

      <div className="mt-8 grid gap-4">
        <Card
          icon={Mail}
          label="Gmail"
          connected={data?.gmail ?? false}
          loading={isLoading}
          description="Used to send outbound and reminder emails."
        />
        <Card
          icon={Linkedin}
          label="LinkedIn"
          connected={data?.linkedin ?? false}
          loading={isLoading}
          description="Used to publish LinkedIn posts (with optional image)."
        />
      </div>

      <section className="mt-8 rounded-lg border border-border bg-panel p-5 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">How to connect or change accounts</p>
        <p className="mt-2">
          Open the <strong>Connectors</strong> panel in Lovable (sidebar → Connectors), then connect or reconnect <em>Gmail</em> and <em>LinkedIn</em>. The connection becomes available to this app immediately — no code changes needed.
        </p>
      </section>
    </main>
  );
}

function Card({
  icon: Icon,
  label,
  connected,
  loading,
  description,
}: {
  icon: typeof Mail;
  label: string;
  connected: boolean;
  loading: boolean;
  description: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">{label}</h2>
        </div>
        {loading ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Checking…
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-500">
            <XCircle className="h-3 w-3" />
            Not connected
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      {!loading && !connected && (
        <p className="mt-3 text-xs italic text-amber-500">
          Connect {label} in the Lovable Connectors panel to enable sending.
        </p>
      )}
    </section>
  );
}
