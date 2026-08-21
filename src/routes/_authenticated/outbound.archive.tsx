import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Clock, Archive, RotateCcw, Mail, BellRing, Linkedin } from "lucide-react";
import { listArchivedOutbound, setOutboundArchived } from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/outbound/archive")({
  head: () => ({
    meta: [
      { title: "VDNX — Archive" },
      { name: "description", content: "Archived outbound requests." },
    ],
  }),
  component: ArchivePage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-2xl p-8">
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    </main>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Not found.</div>,
});

const KIND_META: Record<string, { label: string; icon: typeof Mail }> = {
  outbound_email: { label: "Email", icon: Mail },
  outbound_reminder: { label: "Reminder", icon: BellRing },
  outbound_linkedin: { label: "LinkedIn", icon: Linkedin },
};

function ArchivePage() {
  const listFn = useServerFn(listArchivedOutbound);
  const setArchived = useServerFn(setOutboundArchived);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["outbound", "archive"],
    queryFn: () => listFn({}),
  });

  const rows: any[] = data?.rows ?? [];

  async function unarchive(id: string) {
    setBusy(id);
    try {
      await setArchived({ data: { id, archived: false } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["outbound", "archive"] }),
        qc.invalidateQueries({ queryKey: ["my-outbound"] }),
      ]);
      toast.success("Restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <Link
        to="/outbound"
        search={{}}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to outbound
      </Link>
      <h1 className="mt-3 flex items-center gap-2 font-serif text-3xl font-bold md:text-4xl">
        <Archive className="h-7 w-7 text-primary" />
        Archive
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Archived email, reminder and LinkedIn requests. Restore to send them back to your recent list.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-panel p-5">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing archived yet.</p>
        )}
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const meta = KIND_META[r.kind] ?? { label: r.kind, icon: Mail };
            const Icon = meta.icon;
            const p = (r.payload ?? {}) as Record<string, any>;
            const when = r.archived_at ?? r.decided_at ?? r.created_at;
            const summary = p.text ?? p.subject ?? p.to ?? "(no content)";
            return (
              <li key={r.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5">{r.status}</span>
                    {p.mediaKind && (
                      <span className="rounded-full border border-border px-2 py-0.5">{p.mediaKind}</span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{summary}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Archived {when ? new Date(when).toLocaleString() : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                  disabled={busy === r.id}
                  onClick={() => unarchive(r.id)}
                >
                  <RotateCcw className="h-3 w-3" />
                  {busy === r.id ? "Restoring…" : "Restore"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
