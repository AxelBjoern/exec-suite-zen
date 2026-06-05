import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Mail, BellRing, Linkedin, Clock, CheckCircle2, XCircle, AlertTriangle, Image as ImageIcon, Sparkles, RefreshCw, Wand2, Trash2,
} from "lucide-react";
import {
  requestEmail,
  requestReminder,
  requestLinkedIn,
  listMyRequests,
  ensureOwnerRole,
  approveOutbound,
  updateOutboundDraft,
  sendOwnOutbound,
  aiEditDraft,
  deleteOutbound,
} from "@/lib/outbound.functions";
import { composeLinkedInTagline } from "@/lib/tagline.functions";
import { decodeDraft } from "@/lib/draftLink";
import { streamImage } from "@/lib/streamImage";

export const Route = createFileRoute("/_authenticated/outbound")({
  validateSearch: (s: Record<string, unknown>) => ({ draft: typeof s.draft === "string" ? s.draft : undefined }),
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

function Card({ title, icon: Icon, children, refEl }: { title: string; icon: typeof Mail; children: React.ReactNode; refEl?: React.Ref<HTMLElement> }) {
  return (
    <section ref={refEl} className="rounded-lg border border-border bg-panel p-5">
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
  const search = useSearch({ from: "/_authenticated/outbound" });
  const reqEmail = useServerFn(requestEmail);
  const reqReminder = useServerFn(requestReminder);
  const reqLi = useServerFn(requestLinkedIn);
  const myList = useServerFn(listMyRequests);
  const claimOwner = useServerFn(ensureOwnerRole);
  const approveReq = useServerFn(approveOutbound);
  const updateDraft = useServerFn(updateOutboundDraft);
  const selfSend = useServerFn(sendOwnOutbound);
  const aiEdit = useServerFn(aiEditDraft);
  const deleteReq = useServerFn(deleteOutbound);
  const tagline = useServerFn(composeLinkedInTagline);

  const owner = useQuery({ queryKey: ["ensure-owner"], queryFn: () => claimOwner({ data: undefined as never }), staleTime: Infinity });

  const { data } = useQuery({
    queryKey: ["my-outbound"],
    queryFn: () => myList(),
    refetchInterval: 10000,
  });

  const [email, setEmail] = useState({ to: "", subject: "", body: "" });
  const [reminder, setReminder] = useState({ subject: "", body: "" });
  const [post, setPost] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState<"save" | "send" | "ai" | null>(null);
  const [aiInstr, setAiInstr] = useState("");

  // LinkedIn image gen state
  const [imgB64, setImgB64] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgFinal, setImgFinal] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [taglineText, setTaglineText] = useState("");
  const [visualPrompt, setVisualPrompt] = useState("");

  const emailRef = useRef<HTMLElement>(null);
  const reminderRef = useRef<HTMLElement>(null);
  const liRef = useRef<HTMLElement>(null);

  // ── Apply ?draft= pre-fill once on mount ────────────────────────
  useEffect(() => {
    const d = decodeDraft(search.draft);
    if (!d) return;
    if (d.kind === "email") {
      setEmail({ to: d.to ?? "", subject: d.subject ?? "", body: d.body ?? "" });
      setTimeout(() => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } else if (d.kind === "reminder") {
      setReminder({ subject: d.subject ?? "", body: d.body ?? "" });
      setTimeout(() => reminderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } else if (d.kind === "linkedin") {
      setPost(d.text ?? "");
      setTimeout(() => liRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run<T>(name: string, fn: () => Promise<T>, clear: () => void, msg: { sent: string; pending: string }) {
    setBusy(name);
    try {
      const out: any = await fn();
      toast.success(out?.status === "sent" ? msg.sent : msg.pending);
      clear();
      qc.invalidateQueries({ queryKey: ["my-outbound"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function generateImage() {
    if (!post.trim()) {
      toast.error("Write your LinkedIn post first.");
      return;
    }
    setImgGenerating(true);
    setImgFinal(false);
    setImgB64(null);
    setImgUrl(null);
    try {
      // 1. tagline + visual prompt
      let tagLocal = taglineText;
      let visLocal = visualPrompt;
      if (!tagLocal || !visLocal) {
        const t = await tagline({ data: { text: post } });
        tagLocal = t.tagline;
        visLocal = t.visual_prompt;
        setTaglineText(tagLocal);
        setVisualPrompt(visLocal);
      }
      // 2. stream image
      await streamImage(
        "/api/generate-linkedin-image",
        { tagline: tagLocal, visualPrompt: visLocal },
        (dataUrl, b64, isFinal) => {
          setImgUrl(dataUrl);
          if (isFinal) {
            setImgB64(b64);
            setImgFinal(true);
          }
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setImgGenerating(false);
    }
  }

  function clearImage() {
    setImgB64(null);
    setImgUrl(null);
    setImgFinal(false);
    setTaglineText("");
    setVisualPrompt("");
  }

  async function sendNow(id: string) {
    setRowBusy(id);
    try {
      await selfSend({ data: { id } });
      toast.success("Sent");
      qc.invalidateQueries({ queryKey: ["my-outbound"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteRow(id: string) {
    setRowBusy(id);
    try {
      await deleteReq({ data: { id } });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["my-outbound"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setRowBusy(null);
    }
  }

  function openEdit(r: any) {
    if (r.status !== "pending") return;
    const p = (r.payload ?? {}) as Record<string, string>;
    setEditing(r);
    if (r.kind === "outbound_linkedin") {
      setEditDraft({ text: p.text ?? "" });
    } else {
      setEditDraft({ to: p.to ?? "", subject: p.subject ?? "", body: p.body ?? "" });
    }
  }

  function closeEdit() {
    setEditing(null);
    setEditDraft({});
    setEditBusy(null);
    setAiInstr("");
  }

  async function saveEdit(opts: { send: boolean }) {
    if (!editing) return;
    setEditBusy(opts.send ? "send" : "save");
    try {
      await updateDraft({ data: { id: editing.id, payload: editDraft } });
      if (opts.send) {
        await selfSend({ data: { id: editing.id } });
        toast.success("Sent");
      } else {
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["my-outbound"] });
      closeEdit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEditBusy(null);
    }
  }

  async function runAiEdit() {
    if (!editing || !aiInstr.trim()) return;
    setEditBusy("ai");
    try {
      const out: any = await aiEdit({
        data: { kind: editing.kind, instruction: aiInstr, draft: editDraft },
      });
      if (editing.kind === "outbound_linkedin") {
        setEditDraft({ ...editDraft, text: out.text ?? editDraft.text });
      } else {
        setEditDraft({
          ...editDraft,
          subject: out.subject ?? editDraft.subject,
          body: out.body ?? editDraft.body,
        });
      }
      setAiInstr("");
      toast.success("AI edit applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI edit failed");
    } finally {
      setEditBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Outbound</p>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Request to send</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every email and LinkedIn post goes through your guardrail — auto-send (if you opted in) or queued for owner approval.{" "}
        <Link to="/settings" className="text-primary hover:underline">Settings</Link>
      </p>

      <div className="mt-8 grid gap-4">
        <Card title="Email" icon={Mail} refEl={emailRef}>
          <div className="grid gap-2">
            <input className={inputCls} placeholder="to@example.com" value={email.to} onChange={(e) => setEmail({ ...email, to: e.target.value })} />
            <input className={inputCls} placeholder="Subject" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
            <textarea className={inputCls} rows={5} placeholder="Body" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
            <button
              className={btnCls}
              disabled={busy === "email" || !email.to || !email.subject || !email.body}
              onClick={() =>
                run("email", () => reqEmail({ data: email }), () => setEmail({ to: "", subject: "", body: "" }), {
                  sent: "Sent",
                  pending: "Queued for owner approval",
                })
              }
            >
              {busy === "email" ? "Submitting…" : "Submit"}
            </button>
          </div>
        </Card>

        <Card title="Reminder to owner" icon={BellRing} refEl={reminderRef}>
          <div className="grid gap-2">
            <input className={inputCls} placeholder="Subject" value={reminder.subject} onChange={(e) => setReminder({ ...reminder, subject: e.target.value })} />
            <textarea className={inputCls} rows={4} placeholder="What should the owner be reminded about?" value={reminder.body} onChange={(e) => setReminder({ ...reminder, body: e.target.value })} />
            <button
              className={btnCls}
              disabled={busy === "reminder" || !reminder.subject || !reminder.body}
              onClick={() =>
                run("reminder", () => reqReminder({ data: reminder }), () => setReminder({ subject: "", body: "" }), {
                  sent: "Sent",
                  pending: "Queued for owner approval",
                })
              }
            >
              {busy === "reminder" ? "Submitting…" : "Submit"}
            </button>
          </div>
        </Card>

        <Card title="LinkedIn post" icon={Linkedin} refEl={liRef}>
          <div className="grid gap-3">
            <textarea className={inputCls} rows={5} placeholder="What do you want to share?" value={post} onChange={(e) => setPost(e.target.value)} />

            <div className="rounded-md border border-dashed border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Generated share image (optional)
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                    onClick={generateImage}
                    disabled={imgGenerating || !post.trim()}
                  >
                    {imgGenerating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {imgUrl ? "Regenerate" : "Generate image"}
                  </button>
                  {imgUrl && (
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted"
                      onClick={clearImage}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {taglineText && (
                <p className="mt-2 text-xs">
                  <span className="text-muted-foreground">Tagline:</span> <strong>{taglineText}</strong>
                </p>
              )}
              {imgUrl && (
                <div className="mt-3">
                  <img
                    src={imgUrl}
                    alt="LinkedIn share"
                    className={`mx-auto h-auto w-full max-w-[280px] rounded-md transition-[filter] ${imgFinal ? "blur-0" : "blur-md"}`}
                  />
                </div>
              )}
            </div>

            <button
              className={btnCls}
              disabled={busy === "post" || !post.trim()}
              onClick={() =>
                run(
                  "post",
                  () => reqLi({ data: { text: post, imageBase64: imgFinal ? imgB64 : null } }),
                  () => {
                    setPost("");
                    clearImage();
                  },
                  { sent: "Posted", pending: "Queued for owner approval" },
                )
              }
            >
              {busy === "post" ? "Submitting…" : imgFinal ? "Submit with image" : "Submit"}
            </button>
          </div>
        </Card>

        <section className="rounded-lg border border-border bg-panel p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold">My recent requests</h2>
          {!data?.rows?.length && <p className="text-xs text-muted-foreground">Nothing submitted yet.</p>}
          <ul className="divide-y divide-border">
            {data?.rows?.map((r: any) => {
              const p = (r.payload ?? {}) as Record<string, string>;
              const clickable = r.status === "pending";
              return (
                <li
                  key={r.id}
                  className={`flex items-start justify-between gap-3 py-3 ${clickable ? "cursor-pointer rounded-md px-2 -mx-2 hover:bg-muted/40" : ""}`}
                  onClick={clickable ? () => openEdit(r) : undefined}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium uppercase tracking-wider text-muted-foreground">
                        {r.kind.replace("outbound_", "")}
                      </span>
                      <StatusBadge status={r.status} />
                      {clickable && (
                        <span className="text-[10px] text-primary">Click to edit</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{p.subject ?? p.text ?? p.to ?? ""}</p>
                    {r.notes && r.status !== "sent" && (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {r.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      {r.status === "pending" && (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                          disabled={rowBusy === r.id}
                          onClick={(e) => { e.stopPropagation(); sendNow(r.id); }}
                        >
                          {rowBusy === r.id ? "Sending…" : "Send now"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        disabled={rowBusy === r.id}
                        onClick={(e) => { e.stopPropagation(); deleteRow(r.id); }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-border bg-panel p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold">
                Edit {editing.kind.replace("outbound_", "")}
              </h3>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={closeEdit}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-2">
              {editing.kind === "outbound_linkedin" ? (
                <textarea
                  className={inputCls}
                  rows={10}
                  value={editDraft.text ?? ""}
                  onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })}
                />
              ) : (
                <>
                  {editing.kind === "outbound_email" && (
                    <input
                      className={inputCls}
                      placeholder="to@example.com"
                      value={editDraft.to ?? ""}
                      onChange={(e) => setEditDraft({ ...editDraft, to: e.target.value })}
                    />
                  )}
                  <input
                    className={inputCls}
                    placeholder="Subject"
                    value={editDraft.subject ?? ""}
                    onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                  />
                  <textarea
                    className={inputCls}
                    rows={8}
                    placeholder="Body"
                    value={editDraft.body ?? ""}
                    onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                  />
                </>
              )}
            </div>

            <div className="mt-4 rounded-md border border-dashed border-border bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5" />
                Edit with AI
              </div>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder='e.g. "make it shorter and more casual"'
                  value={aiInstr}
                  onChange={(e) => setAiInstr(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && aiInstr.trim() && !editBusy) runAiEdit(); }}
                  disabled={!!editBusy}
                />
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                  onClick={runAiEdit}
                  disabled={!!editBusy || !aiInstr.trim()}
                >
                  {editBusy === "ai" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {editBusy === "ai" ? "Thinking…" : "Apply"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                onClick={closeEdit}
                disabled={!!editBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                onClick={() => saveEdit({ send: false })}
                disabled={!!editBusy}
              >
                {editBusy === "save" ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                className={btnCls}
                onClick={() => saveEdit({ send: true })}
                disabled={!!editBusy}
              >
                {editBusy === "send" ? "Sending…" : "Save & send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
