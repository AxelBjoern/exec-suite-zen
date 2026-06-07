import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Linkedin } from "lucide-react";
import { listSentLinkedIn } from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/outbound/archive")({
  head: () => ({
    meta: [
      { title: "VDNX — LinkedIn archive" },
      { name: "description", content: "Past LinkedIn posts you've sent." },
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

function ArchivePage() {
  const listFn = useServerFn(listSentLinkedIn);
  const { data, isLoading } = useQuery({
    queryKey: ["outbound", "linkedin-archive"],
    queryFn: () => listFn({}),
  });

  const rows: any[] = data?.rows ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <Link
        to="/outbound"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" /> Back to outbound
      </Link>
      <h1 className="mt-3 flex items-center gap-2 font-serif text-3xl font-bold md:text-4xl">
        <Linkedin className="h-7 w-7 text-primary" />
        LinkedIn archive
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Posts that have been sent. Read-only.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-panel p-5">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No sent posts yet.</p>
        )}
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const p = (r.payload ?? {}) as Record<string, any>;
            const when = r.decided_at ?? r.created_at;
            const url: string | undefined = p.postUrl ?? p.shareUrl ?? p.url;
            return (
              <li key={r.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm">{p.text ?? "(no text)"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Sent {when ? new Date(when).toLocaleString() : "—"}
                    </span>
                    {p.mediaKind && (
                      <span className="rounded-full border border-border px-2 py-0.5">{p.mediaKind}</span>
                    )}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        View on LinkedIn ↗
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
