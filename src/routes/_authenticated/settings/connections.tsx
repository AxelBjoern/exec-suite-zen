import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Linkedin, Plug } from "lucide-react";
import {
  startConnect,
  saveConnection,
  listMyConnections,
  disconnectProvider,
  GATEWAY_BASE_URL,
} from "@/lib/connections.functions";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";

export const Route = createFileRoute("/_authenticated/settings/connections")({
  head: () => ({
    meta: [
      { title: "VDNX — Connections" },
      { name: "description", content: "Connect Gmail for personal sending and manage workspace-backed outbound connections." },
    ],
  }),
  component: ConnectionsPage,
});

type Provider = "gmail" | "linkedin";

function ConnectionsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMyConnections);
  const start = useServerFn(startConnect);
  const save = useServerFn(saveConnection);
  const disconnect = useServerFn(disconnectProvider);

  const { data } = useQuery({ queryKey: ["my-connections"], queryFn: () => list() });
  const [busy, setBusy] = useState<Provider | null>(null);

  async function connect(provider: Provider) {
    setBusy(provider);
    try {
      const result = await connectAppUser({
        connectorId: provider === "gmail" ? "google" : "linkedin",
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: async (targetOrigin) => {
          const res = await start({ data: { provider, targetOrigin } });
          if (res.unsupported || !res.authorizationUrl) {
            throw new Error(res.message ?? "Personal connect not configured");
          }
          return { authorizationUrl: res.authorizationUrl };
        },
      });
      if (!result.success || !result.connectionId) {
        toast.error(result.error ?? "Failed to connect");
        return;
      }
      const saved = await save({ data: { provider, connectionId: result.connectionId } });
      toast.success(`${provider === "gmail" ? "Gmail" : "LinkedIn"} connected${saved.providerEmail ? ` (${saved.providerEmail})` : ""}`);
      qc.invalidateQueries({ queryKey: ["my-connections"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function unlink(provider: Provider) {
    setBusy(provider);
    try {
      await disconnect({ data: { provider } });
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["my-connections"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const gmail = data?.rows?.find((r: any) => r.provider === "gmail");
  const linkedin = data?.rows?.find((r: any) => r.provider === "linkedin");

  function Card({
    provider,
    icon: Icon,
    label,
    row,
  }: {
    provider: Provider;
    icon: typeof Mail;
    label: string;
    row: any;
  }) {
    return (
      <section className="rounded-lg border border-border bg-panel p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h2 className="font-serif text-lg font-semibold">{label}</h2>
          </div>
          {row && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-500">
              Connected
            </span>
          )}
        </div>
        {row ? (
          <>
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">Account:</span>{" "}
              <strong>{row.provider_email ?? row.provider_name ?? "—"}</strong>
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                onClick={() => connect(provider)}
                disabled={busy === provider}
              >
                Reconnect
              </button>
              <button
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-destructive hover:bg-muted disabled:opacity-50"
                onClick={() => unlink(provider)}
                disabled={busy === provider}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {provider === "linkedin"
                ? "Sign in with your LinkedIn account so posts go from you, not the shared workspace connection."
                : `Sign in with your ${label} account so outbound sends from you, not a shared workspace connector.`}
            </p>
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
              onClick={() => connect(provider)}
              disabled={busy === provider}
            >
              <Plug className="h-3.5 w-3.5" />
              {busy === provider ? "Opening…" : `Connect ${label}`}
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Settings · Connections</p>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Your accounts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Connect Gmail and LinkedIn as your own accounts.
      </p>
      <div className="mt-8 grid gap-4">
        <Card provider="gmail" icon={Mail} label="Gmail" row={gmail} />
        <Card provider="linkedin" icon={Linkedin} label="LinkedIn" row={linkedin} />
      </div>
    </main>
  );
}
