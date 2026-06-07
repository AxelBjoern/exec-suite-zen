import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Mail, BellRing, Linkedin, Clock, CheckCircle2, XCircle, AlertTriangle, Image as ImageIcon, Sparkles, RefreshCw, Wand2, Trash2, Upload, Layers, FileText, Film,
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
  generateKlingClipForOutbound,
  getOutboundFull,

} from "@/lib/outbound.functions";
import { composeLinkedInTagline } from "@/lib/tagline.functions";
import { decodeDraft } from "@/lib/draftLink";
import { streamImage } from "@/lib/streamImage";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const authHeader = async (): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Convert "YYYY-MM-DDTHH:mm" (browser local) → real ISO string w/ offset.
// Without this, the server reads the string as UTC and schedules fire at the
// wrong wall-clock time for anyone outside UTC.
function localToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function fileToBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

const ACCEPT_MIME = {
  image: "image/png,image/jpeg,image/webp,image/jpg",
  pdf: "application/pdf",
  video: "video/mp4,video/quicktime,video/mov",
};
const MAX_SIZE = { image: 6_000_000, pdf: 12_000_000, video: 20_000_000 };

function mimeKind(mime: string): "image" | "pdf" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return null;
}

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

function DropZone({
  value,
  onChange,
  onClear,
  disabled,
  dragOver,
  setDragOver,
  label = "Drop image, PDF or video here",
}: {
  value: { kind: "image" | "pdf" | "video"; base64: string; mime: string; filename: string } | null;
  onChange: (v: { kind: "image" | "pdf" | "video"; base64: string; mime: string; filename: string }) => void;
  onClear: () => void;
  disabled?: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const f = files[0];
    const kind = mimeKind(f.type);
    if (!kind) {
      toast.error("Only images (PNG/JPG/WebP), PDFs or MP4/MOV videos allowed.");
      return;
    }
    const limit = MAX_SIZE[kind];
    if (f.size > limit) {
      toast.error(`${kind} too large (> ${Math.round(limit / 1e6)} MB)`);
      return;
    }
    const b64 = await fileToBase64(f);
    onChange({ kind, base64: b64, mime: f.type || (kind === "image" ? "image/png" : kind === "pdf" ? "application/pdf" : "video/mp4"), filename: f.name });
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 border-dashed p-6 text-center transition",
        dragOver ? "border-primary bg-primary/5" : "border-border bg-background/40",
        disabled && "opacity-50 pointer-events-none",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={`${ACCEPT_MIME.image},${ACCEPT_MIME.pdf},${ACCEPT_MIME.video}`}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {value ? (
        <div className="flex flex-col items-center gap-2">
          {value.kind === "image" && (
            <img
              src={`data:${value.mime};base64,${value.base64}`}
              alt={value.filename}
              className="h-auto max-h-40 w-auto max-w-full rounded-md object-contain"
            />
          )}
          {value.kind === "video" && (
            <video src={`data:${value.mime};base64,${value.base64}`} controls className="max-h-40 w-full rounded-md" />
          )}
          {value.kind === "pdf" && (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <FileText className="h-5 w-5 text-primary" />
              <span className="max-w-[200px] truncate">{value.filename}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wider">{value.kind}</span>
            <span>~{Math.round(value.base64.length * 0.75 / 1024)} KB</span>
          </div>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      ) : (
        <>
          <Upload className={cn("mx-auto mb-2 h-8 w-8", dragOver ? "text-primary" : "text-muted-foreground")} />
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            PNG, JPG, WebP, PDF or MP4/MOV
          </p>
        </>
      )}
    </div>
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

  const [email, setEmail] = useState({ to: "", subject: "", body: "", scheduled_at: "" });
  const [reminder, setReminder] = useState({ subject: "", body: "", scheduled_at: "" });
  const [post, setPost] = useState("");
  const [postSchedule, setPostSchedule] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState<"save" | "send" | "ai" | "img" | "carousel" | "pdf" | "video" | "kling" | null>(null);
  const [aiInstr, setAiInstr] = useState("");
  // edit-modal image state (LinkedIn only)
  const [editImgB64, setEditImgB64] = useState<string | null>(null);
  const [editImgUrl, setEditImgUrl] = useState<string | null>(null);
  const [editImgFinal, setEditImgFinal] = useState(false);
  const [carouselVariants, setCarouselVariants] = useState<string[]>([]);
  const [editImgDescription, setEditImgDescription] = useState("");
  const editFileInputRef = useRef<HTMLInputElement>(null);
  // edit-modal: pdf / video media
  const [editMedia, setEditMedia] = useState<{ kind: "pdf" | "video" | "image"; base64: string; mime: string; filename: string } | null>(null);
  const editPdfInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);
  const [editKlingPrompt, setEditKlingPrompt] = useState("");
  // drag-drop state
  const [dragOver, setDragOver] = useState(false);

  // LinkedIn image gen state
  const [imgB64, setImgB64] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgFinal, setImgFinal] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [taglineText, setTaglineText] = useState("");
  const [visualPrompt, setVisualPrompt] = useState("");
  // LinkedIn pdf/video media (main card)
  const [postMedia, setPostMedia] = useState<{ kind: "pdf" | "video" | "image"; base64: string; mime: string; filename: string } | null>(null);
  const [klingPrompt, setKlingPrompt] = useState("");
  const [klingBusy, setKlingBusy] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // main card drag-drop
  const [mainDragOver, setMainDragOver] = useState(false);

  const emailRef = useRef<HTMLElement>(null);
  const reminderRef = useRef<HTMLElement>(null);
  const liRef = useRef<HTMLElement>(null);
  const genKling = useServerFn(generateKlingClipForOutbound);

  // ── Apply ?draft= pre-fill once on mount ────────────────────────
  useEffect(() => {
    const d = decodeDraft(search.draft);
    if (!d) return;
    if (d.kind === "email") {
      setEmail({ to: d.to ?? "", subject: d.subject ?? "", body: d.body ?? "", scheduled_at: "" });
      setTimeout(() => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } else if (d.kind === "reminder") {
      setReminder({ subject: d.subject ?? "", body: d.body ?? "", scheduled_at: "" });
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
        "/api/public/generate-linkedin-image",
        { tagline: tagLocal, visualPrompt: visLocal },
        (dataUrl, b64, isFinal) => {
          setImgUrl(dataUrl);
          if (isFinal) {
            setImgB64(b64);
            setImgFinal(true);
          }
        },
        undefined,
        await authHeader(),
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
      const result = await selfSend({ data: { id } });
      if (result?.status === "failed") {
        toast.error(result.error ?? "Failed to send");
      } else {
        toast.success("Sent");
      }
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
    setEditImgB64(null);
    setEditImgUrl(null);
    setEditImgFinal(false);
    setCarouselVariants([]);
    setEditImgDescription("");
    setEditMedia(null);
    setEditKlingPrompt("");
    const localSched = isoToLocal(p.scheduled_at);
    if (r.kind === "outbound_linkedin") {
      setEditDraft({ text: p.text ?? "", scheduled_at: localSched });
      // restore existing media into drop-zone state
      if (p.mediaBase64 && !p.mediaBase64.startsWith("[") && p.mediaKind) {
        setEditMedia({ kind: p.mediaKind as "image" | "pdf" | "video", base64: p.mediaBase64, mime: p.mediaMime || "", filename: p.mediaFilename || "" });
      }
    } else {
      setEditDraft({ to: p.to ?? "", subject: p.subject ?? "", body: p.body ?? "", scheduled_at: localSched });
    }
  }

  function closeEdit() {
    setEditing(null);
    setEditDraft({});
    setEditBusy(null);
    setAiInstr("");
    setEditImgB64(null);
    setEditImgUrl(null);
    setEditImgFinal(false);
    setCarouselVariants([]);
    setEditImgDescription("");
    setEditMedia(null);
    setEditKlingPrompt("");
  }

  async function saveEdit(opts: { send: boolean }) {
    if (!editing) return;
    setEditBusy(opts.send ? "send" : "save");
    try {
      const payload: Record<string, any> = { ...editDraft };
      // Convert local datetime → real ISO with offset for the server / cron
      payload.scheduled_at = localToIso(editDraft.scheduled_at) ?? null;
      // Strip sentinels so we don't overwrite the stored bytes
      if (payload.imageBase64 === "[image]") delete payload.imageBase64;
      if (typeof payload.mediaBase64 === "string" && payload.mediaBase64.startsWith("[")) {
        delete payload.mediaBase64; delete payload.mediaKind; delete payload.mediaMime; delete payload.mediaFilename;
      }
      if (editing.kind === "outbound_linkedin") {
        if (editMedia) {
          payload.mediaKind = editMedia.kind;
          payload.mediaBase64 = editMedia.base64;
          payload.mediaMime = editMedia.mime;
          payload.mediaFilename = editMedia.filename;
          payload.imageBase64 = null;
        } else if (editImgFinal && editImgB64) {
          payload.imageBase64 = editImgB64;
        }
      }
      await updateDraft({ data: { id: editing.id, payload } });
      if (opts.send) {
        const result = await selfSend({ data: { id: editing.id } });
        if (result?.status === "failed") {
          toast.error(result.error ?? "Failed");
          qc.invalidateQueries({ queryKey: ["my-outbound"] });
          closeEdit();
          return;
        }
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

  async function generateEditImage() {
    if (!editing || !editDraft.text?.trim()) {
      toast.error("Post text required.");
      return;
    }
    setEditBusy("img");
    setEditImgFinal(false);
    setEditImgB64(null);
    setEditImgUrl(null);
    setCarouselVariants([]);
    try {
      const t = await tagline({ data: { text: editDraft.text } });
      const visual = editImgDescription.trim() || t.visual_prompt;
      await streamImage(
        "/api/public/generate-linkedin-image",
        { tagline: t.tagline, visualPrompt: visual },
        (dataUrl, b64, isFinal) => {
          setEditImgUrl(dataUrl);
          if (isFinal) {
            setEditImgB64(b64);
            setEditImgFinal(true);
          }
        },
        undefined,
        await authHeader(),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setEditBusy(null);
    }
  }

  async function uploadEditImage(file: File) {
    if (file.size > 6_000_000) {
      toast.error("Image must be under 6 MB.");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    setEditImgB64(b64);
    setEditImgUrl(`data:${file.type || "image/png"};base64,${b64}`);
    setEditImgFinal(true);
    setCarouselVariants([]);
    toast.success("Image attached");
  }

  async function generateCarousel() {
    if (!editing || !editDraft.text?.trim()) {
      toast.error("Post text required.");
      return;
    }
    setEditBusy("carousel");
    setCarouselVariants([]);
    setEditImgFinal(false);
    setEditImgB64(null);
    setEditImgUrl(null);
    try {
      const t = await tagline({ data: { text: editDraft.text } });
      const visual = editImgDescription.trim() || t.visual_prompt;
      // Run 3 generations in parallel; collect the final frames
      const hdr = await authHeader();
      const results = await Promise.allSettled(
        [0, 1, 2].map(
          (i) =>
            new Promise<string>((resolve, reject) => {
              streamImage(
                "/api/public/generate-linkedin-image",
                { tagline: t.tagline, visualPrompt: `${visual} (variant ${i + 1})` },
                (_dataUrl, b64, isFinal) => {
                  if (isFinal) resolve(b64);
                },
                undefined,
                hdr,
              ).catch(reject);
            }),
        ),
      );
      const variants = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (!variants.length) throw new Error("All variants failed");
      setCarouselVariants(variants);
      toast.success(`${variants.length} variants ready — pick one`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Carousel generation failed");
    } finally {
      setEditBusy(null);
    }
  }

  function pickCarouselVariant(b64: string) {
    setEditImgB64(b64);
    setEditImgUrl(`data:image/png;base64,${b64}`);
    setEditImgFinal(true);
    setCarouselVariants([]);
  }

  function clearEditImage() {
    setEditImgB64(null);
    setEditImgUrl(null);
    setEditImgFinal(false);
    setCarouselVariants([]);
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
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Send at (optional)
              <input type="datetime-local" className={inputCls + " flex-1"} value={email.scheduled_at}
                onChange={(e) => setEmail({ ...email, scheduled_at: e.target.value })} />
            </label>
            <button
              className={btnCls}
              disabled={busy === "email" || !email.to || !email.subject || !email.body}
              onClick={() =>
                run("email", () => reqEmail({ data: { ...email, scheduled_at: localToIso(email.scheduled_at) } }), () => setEmail({ to: "", subject: "", body: "", scheduled_at: "" }), {
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
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Send at (optional)
              <input type="datetime-local" className={inputCls + " flex-1"} value={reminder.scheduled_at}
                onChange={(e) => setReminder({ ...reminder, scheduled_at: e.target.value })} />
            </label>
            <button
              className={btnCls}
              disabled={busy === "reminder" || !reminder.subject || !reminder.body}
              onClick={() =>
                run("reminder", () => reqReminder({ data: { ...reminder, scheduled_at: localToIso(reminder.scheduled_at) } }), () => setReminder({ subject: "", body: "", scheduled_at: "" }), {
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
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Post at (optional)
              <input type="datetime-local" className={inputCls + " flex-1"} value={postSchedule}
                onChange={(e) => setPostSchedule(e.target.value)} />
            </label>

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

            {/* Drag & drop media zone */}
            <div className="rounded-md border border-dashed border-border bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                Media (image, PDF carousel or video)
              </div>
              <DropZone
                value={postMedia}
                onChange={(v) => { setPostMedia(v); if (v.kind === "image") clearImage(); }}
                onClear={() => setPostMedia(null)}
                disabled={klingBusy}
                dragOver={mainDragOver}
                setDragOver={setMainDragOver}
              />
              <div className="mt-3 flex gap-2">
                <input className={inputCls + " flex-1"} placeholder="Or describe a clip to generate with Kling…"
                  value={klingPrompt} onChange={(e) => setKlingPrompt(e.target.value)} disabled={klingBusy} />
                <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                  disabled={klingBusy || !klingPrompt.trim()}
                  onClick={async () => {
                    setKlingBusy(true);
                    try {
                      const r = await genKling({ data: { prompt: klingPrompt } });
                      setPostMedia({ kind: "video", base64: r.base64, mime: r.mime, filename: r.filename });
                      toast.success("Kling clip ready");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Kling generation failed");
                    } finally { setKlingBusy(false); }
                  }}>
                  {klingBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {klingBusy ? "Generating…" : "Generate clip"}
                </button>
              </div>
            </div>

            <button
              className={btnCls}
              disabled={busy === "post" || !post.trim()}
              onClick={() =>
                run(
                  "post",
                  () => reqLi({
                    data: {
                      text: post,
                      // image (legacy) only if no pdf/video attached
                      imageBase64: !postMedia && imgFinal ? imgB64 : null,
                      mediaKind: postMedia?.kind ?? null,
                      mediaBase64: postMedia?.base64 ?? null,
                      mediaMime: postMedia?.mime ?? null,
                      mediaFilename: postMedia?.filename ?? null,
                      scheduled_at: localToIso(postSchedule),
                    },
                  }),
                  () => {
                    setPost("");
                    setPostSchedule("");
                    clearImage();
                    setPostMedia(null);
                    setKlingPrompt("");
                  },
                  { sent: "Posted", pending: "Queued for owner approval" },
                )
              }
            >
              {busy === "post" ? "Submitting…" : postMedia ? `Submit with ${postMedia.kind}` : imgFinal ? "Submit with image" : "Submit"}
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
                    {p.scheduled_at && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                        <Clock className="h-3 w-3" /> Scheduled: {new Date(p.scheduled_at).toLocaleString()}
                      </p>
                    )}
                    {r.notes && r.status !== "sent" && (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {r.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      {r.status === "pending" && !r.notes && (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                          disabled={rowBusy === r.id}
                          onClick={(e) => { e.stopPropagation(); sendNow(r.id); }}
                        >
                          {rowBusy === r.id ? "Sending…" : "Send now"}
                        </button>
                      )}
                      {r.notes && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                          disabled={rowBusy === r.id}
                          onClick={(e) => { e.stopPropagation(); sendNow(r.id); }}
                        >
                          {rowBusy === r.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {rowBusy === r.id ? "Retrying…" : "Retry"}
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
                <>
                  <textarea
                    className={inputCls}
                    rows={10}
                    value={editDraft.text ?? ""}
                    onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })}
                  />
                  <div className="rounded-md border border-dashed border-border bg-background/40 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Image
                        {editDraft.imageBase64 === "[image]" && !editImgUrl && (
                          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">attached</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                          onClick={generateEditImage}
                          disabled={!!editBusy}
                        >
                          {editBusy === "img" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Generate
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                          onClick={() => editFileInputRef.current?.click()}
                          disabled={!!editBusy}
                        >
                          <Upload className="h-3 w-3" />
                          Upload
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                          onClick={generateCarousel}
                          disabled={!!editBusy}
                        >
                          {editBusy === "carousel" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
                          Carousel ×3
                        </button>
                        {(editImgUrl || editDraft.imageBase64 === "[image]") && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                            onClick={() => {
                              clearEditImage();
                              // Explicitly drop existing image bytes on save
                              setEditDraft({ ...editDraft, imageBase64: "" });
                            }}
                            disabled={!!editBusy}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      className={inputCls}
                      rows={2}
                      placeholder="Describe the image you want (optional — e.g. dark navy background with abstract geometric shapes and gold accents)"
                      value={editImgDescription}
                      onChange={(e) => setEditImgDescription(e.target.value)}
                    />
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadEditImage(f);
                        e.target.value = "";
                      }}
                    />
                    {editImgUrl && (
                      <img
                        src={editImgUrl}
                        alt="LinkedIn share"
                        className={`mx-auto h-auto w-full max-w-[240px] rounded-md transition-[filter] ${editImgFinal ? "blur-0" : "blur-md"}`}
                      />
                    )}
                    {carouselVariants.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {carouselVariants.map((b64, i) => (
                          <button
                            key={i}
                            type="button"
                            className="overflow-hidden rounded-md border border-border transition hover:border-primary"
                            onClick={() => pickCarouselVariant(b64)}
                          >
                            <img src={`data:image/png;base64,${b64}`} alt={`Variant ${i + 1}`} className="h-auto w-full" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Drag & drop media zone for edit modal */}
                  <div className="rounded-md border border-dashed border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Upload className="h-3.5 w-3.5" />
                      Media (image, PDF carousel or video)
                      {!editMedia && (editDraft.mediaBase64 || "").startsWith("[") && (
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          {editDraft.mediaKind ?? "media"} attached
                        </span>
                      )}
                    </div>
                    <DropZone
                      value={editMedia}
                      onChange={(v) => { setEditMedia(v); if (v.kind === "image") clearEditImage(); }}
                      onClear={() => { setEditMedia(null); setEditDraft({ ...editDraft, mediaBase64: "", mediaKind: "", mediaMime: "", mediaFilename: "" }); }}
                      disabled={!!editBusy}
                      dragOver={dragOver}
                      setDragOver={setDragOver}
                    />
                    <div className="mt-3 flex gap-2">
                      <input className={inputCls + " flex-1"} placeholder="Or describe a clip to generate with Kling…"
                        value={editKlingPrompt} onChange={(e) => setEditKlingPrompt(e.target.value)} disabled={!!editBusy} />
                      <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                        disabled={!!editBusy || !editKlingPrompt.trim()}
                        onClick={async () => {
                          setEditBusy("kling");
                          try {
                            const r = await genKling({ data: { prompt: editKlingPrompt } });
                            setEditMedia({ kind: "video", base64: r.base64, mime: r.mime, filename: r.filename });
                            toast.success("Kling clip ready");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Kling failed");
                          } finally { setEditBusy(null); }
                        }}>
                        {editBusy === "kling" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {editBusy === "kling" ? "Generating…" : "Generate"}
                      </button>
                    </div>
                  </div>
                </>

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

            <label className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Send at (optional)
              <input
                type="datetime-local"
                className={inputCls + " flex-1"}
                value={editDraft.scheduled_at ?? ""}
                onChange={(e) => setEditDraft({ ...editDraft, scheduled_at: e.target.value })}
              />
            </label>


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
