import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, BellRing, Linkedin } from "lucide-react";
import {
  sendGmail,
  sendReminderToSelf,
  postToLinkedIn,
} from "@/lib/outbound.functions";

export const Route = createFileRoute("/_authenticated/outbound")({
  head: () => ({
    meta: [
      { title: "VDNX — Outbound" },
      { name: "description", content: "Send email, reminders, and LinkedIn posts from the board." },
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

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Mail;
  children: React.ReactNode;
}) {
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

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btnCls =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

function OutboundPage() {
  const sendEmail = useServerFn(sendGmail);
  const sendReminder = useServerFn(sendReminderToSelf);
  const sendPost = useServerFn(postToLinkedIn);

  const [email, setEmail] = useState({ to: "", subject: "", body: "" });
  const [reminder, setReminder] = useState({ subject: "", body: "" });
  const [post, setPost] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run<T>(name: string, fn: () => Promise<T>, success: string) {
    setBusy(name);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Outbound</p>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Send from the board</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Email, self-reminders, and LinkedIn posts from your connected accounts.
      </p>

      <div className="mt-8 grid gap-4">
        <Card title="Send email" icon={Mail}>
          <div className="grid gap-2">
            <input
              className={inputCls}
              placeholder="to@example.com"
              value={email.to}
              onChange={(e) => setEmail({ ...email, to: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Subject"
              value={email.subject}
              onChange={(e) => setEmail({ ...email, subject: e.target.value })}
            />
            <textarea
              className={inputCls}
              rows={5}
              placeholder="Body"
              value={email.body}
              onChange={(e) => setEmail({ ...email, body: e.target.value })}
            />
            <button
              className={btnCls}
              disabled={busy === "email" || !email.to || !email.subject || !email.body}
              onClick={() =>
                run("email", () => sendEmail({ data: email }), "Email sent")
              }
            >
              {busy === "email" ? "Sending…" : "Send email"}
            </button>
          </div>
        </Card>

        <Card title="Remind me" icon={BellRing}>
          <div className="grid gap-2">
            <input
              className={inputCls}
              placeholder="Subject"
              value={reminder.subject}
              onChange={(e) => setReminder({ ...reminder, subject: e.target.value })}
            />
            <textarea
              className={inputCls}
              rows={4}
              placeholder="What should I remind you about?"
              value={reminder.body}
              onChange={(e) => setReminder({ ...reminder, body: e.target.value })}
            />
            <button
              className={btnCls}
              disabled={busy === "reminder" || !reminder.subject || !reminder.body}
              onClick={() =>
                run("reminder", () => sendReminder({ data: reminder }), "Reminder sent to owner")
              }
            >
              {busy === "reminder" ? "Sending…" : "Send reminder"}
            </button>
          </div>
        </Card>

        <Card title="Post to LinkedIn" icon={Linkedin}>
          <div className="grid gap-2">
            <textarea
              className={inputCls}
              rows={5}
              placeholder="What do you want to share?"
              value={post}
              onChange={(e) => setPost(e.target.value)}
            />
            <button
              className={btnCls}
              disabled={busy === "post" || !post.trim()}
              onClick={() =>
                run("post", () => sendPost({ data: { text: post } }), "Posted to LinkedIn")
              }
            >
              {busy === "post" ? "Posting…" : "Publish post"}
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}
