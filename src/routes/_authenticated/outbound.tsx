import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, BellRing, Linkedin, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  requestEmail,
  requestReminder,
  requestLinkedIn,
  listMyRequests,
  ensureOwnerRole,
} from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/outbound")({
  head: () => ({
    meta: [
      { title: "VDNX — Outbound" },
      { name: "description", content: "Submit email and LinkedIn posts for owner approval." },
    ],
  }),
  component: OutboundPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-2xl p-8">
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    </main>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Not found.</div>,
});

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btnCls =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: typeof Clock; cls: string; label: string }> = {
    pending: { icon: Clock, cls: "text-amber-500", label: "Pending" },
    sent: { icon: CheckCircle2, cls: "text-emerald-500", label: "Sent" },
    rejected: { icon: XCircle, cls: "text-muted-foreground", label: "Rejected" },
    failed: { icon: AlertTriangle, cls: "text-destructive", label: "Failed" },
  };
  const m = map[status] ?? map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function OutboundPage() {
  const qc = useQueryClient();
  const reqEmail = useServerFn(requestEmail);
  const reqReminder = useServerFn(requestReminder);
  const reqLi = useServerFn(requestLinkedIn);
  const myList = useServerFn(listMyRequests);
  const claimOwner = useServerFn(ensureOwnerRole);

  // fire-and-forget owner bootstrap on mount
  useQuery({ queryKey: ["ensure-owner"], queryFn: () => claimOwner({ data: undefined as never }), staleTime: Infinity });

  const { data } = useQuery({
    queryKey: ["my-outbound"],
    queryFn: () => myList(),
    refetchInterval: 10000,
  });

  const [email, setEmail] = useState({ to: "", subject: "", body: "" });
  const [reminder, setReminder] = useState({ subject: "", body: "" });
  const [post, setPost] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run<T>(name: string, fn: () => Promise<T>, clear: () => void) {
    setBusy(name);
    try {
      await fn();
      toast.success("Submitted for owner approval");
      clear();
      qc.invalidateQueries({ queryKey: ["my-outbound"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Outbound</p>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Request to send</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every email and LinkedIn post is queued and only goes out after the owner approves it.
      </p>

      <div className="mt-8 grid gap-4">
        <Card title="Email" icon={Mail}>
          <div className="grid gap-2">
            <input className={inputCls} placeholder="to@example.com" value={email.to} onChange={(e) => setEmail({ ...email, to: e.target.value })} />
            <input className={inputCls} placeholder="Subject" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
            <textarea className={inputCls} rows={5} placeholder="Body" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
            <button
              className={btnCls}
              disabled={busy === "email" || !email.to || !email.subject || !email.body}
              onClick={() => run("email", () => reqEmail({ data: email }), () => setEmail({ to: "", subject: "", body: "" }))}
            >
              {busy === "email" ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
        </Card>

        <Card title="Reminder to owner" icon={BellRing}>
          <div className="grid gap-2">
            <input className={inputCls} placeholder="Subject" value={reminder.subject} onChange={(e) => setReminder({ ...reminder, subject: e.target.value })} />
            <textarea className={inputCls} rows={4} placeholder="What should the owner be reminded about?" value={reminder.body} onChange={(e) => setReminder({ ...reminder, body: e.target.value })} />
            <button
              className={btnCls}
              disabled={busy === "reminder" || !reminder.subject || !reminder.body}
              onClick={() => run("reminder", () => reqReminder({ data: reminder }), () => setReminder({ subject: "", body: "" }))}
            >
              {busy === "reminder" ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
        </Card>

        <Card title="LinkedIn post" icon={Linkedin}>
          <div className="grid gap-2">
            <textarea className={inputCls} rows={5} placeholder="What do you want to share?" value={post} onChange={(e) => setPost(e.target.value)} />
            <button
              className={btnCls}
              disabled={busy === "post" || !post.trim()}
              onClick={() => run("post", () => reqLi({ data: { text: post } }), () => setPost(""))}
            >
              {busy === "post" ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
        </Card>

        <section className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold">My recent requests</h2>
          {!data?.rows?.length && <p className="text-xs text-muted-foreground">Nothing submitted yet.</p>}
          <ul className="divide-y divide-border">
            {data?.rows?.map((r) => {
              const p = (r.payload ?? {}) as Record<string, string>;
              return (
                <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium uppercase tracking-wider text-muted-foreground">
                        {r.kind.replace("outbound_", "")}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 truncate text-sm">{p.subject ?? p.text ?? p.to ?? ""}</p>
                    {r.notes && r.status !== "sent" && (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {r.notes}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
