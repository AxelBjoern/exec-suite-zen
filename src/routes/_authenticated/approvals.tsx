import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Mail, Linkedin, BellRing } from "lucide-react";
import {
  listPendingApprovals,
  approveOutbound,
  rejectOutbound,
  ensureOwnerRole,
} from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "VDNX — Approvals" },
      { name: "description", content: "Owner approval queue for outbound mail and LinkedIn posts." },
    ],
  }),
  component: ApprovalsPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-2xl p-8">
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    </main>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Not found.</div>,
});

const KIND_ICON = {
  outbound_email: Mail,
  outbound_reminder: BellRing,
  outbound_linkedin: Linkedin,
} as const;

function ApprovalsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingApprovals);
  const approveFn = useServerFn(approveOutbound);
  const rejectFn = useServerFn(rejectOutbound);
  const ensureFn = useServerFn(ensureOwnerRole);

  const owner = useQuery({
    queryKey: ["ensure-owner"],
    queryFn: () => ensureFn({ data: undefined as never }),
    staleTime: Infinity,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => listFn(),
    enabled: owner.data?.isOwner === true,
    refetchInterval: 10000,
  });

  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id + action);
    try {
      if (action === "approve") await approveFn({ data: { id } });
      else await rejectFn({ data: { id } });
      toast.success(action === "approve" ? "Approved & sent" : "Rejected");
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (owner.isLoading) {
    return <main className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Checking access…</main>;
  }
  if (owner.data && !owner.data.isOwner) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Approvals</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Owner only</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This queue is restricted to the workspace owner.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Owner queue</p>
      </div>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Approvals</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing leaves the system until you approve it here.
      </p>

      <div className="mt-8 grid gap-3">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
        {data?.rows?.filter((r) => r.status === "pending").length === 0 && (
          <p className="text-xs text-muted-foreground">No pending requests.</p>
        )}
        {data?.rows?.map((r) => {
          const Icon = KIND_ICON[r.kind as keyof typeof KIND_ICON] ?? Mail;
          const p = (r.payload ?? {}) as Record<string, string>;
          const isPending = r.status === "pending";
          return (
            <article key={r.id} className="rounded-lg border border-border bg-panel p-5">
              <header className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {r.kind.replace("outbound_", "")}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    · {r.status}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </header>

              <div className="mt-3 space-y-1 text-sm">
                {p.to && (
                  <p>
                    <span className="text-muted-foreground">To:</span> {p.to}
                  </p>
                )}
                {p.subject && (
                  <p>
                    <span className="text-muted-foreground">Subject:</span> {p.subject}
                  </p>
                )}
                {(p.body || p.text) && (
                  <pre className="mt-2 whitespace-pre-wrap rounded border border-border bg-background p-3 font-mono text-xs">
                    {p.body ?? p.text}
                  </pre>
                )}
              </div>

              {r.notes && !isPending && (
                <p className="mt-2 text-xs text-muted-foreground">Note: {r.notes}</p>
              )}

              {isPending && (
                <div className="mt-4 flex gap-2">
                  <button
                    disabled={busy === r.id + "approve"}
                    onClick={() => decide(r.id, "approve")}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    {busy === r.id + "approve" ? "Sending…" : "Approve & send"}
                  </button>
                  <button
                    disabled={busy === r.id + "reject"}
                    onClick={() => decide(r.id, "reject")}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
