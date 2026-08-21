import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Mail, BellRing, Linkedin, Clock, Image as ImageIcon, Sparkles, RefreshCw, Wand2, Trash2, Upload, Layers, FileText, Film, ChevronDown, Archive, AlertTriangle, Check,
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
  startKlingJob,
  pollKlingJob,
  getOutboundMediaUrl,
  getOutboundFull,
  setOutboundArchived,

} from "@/lib/outbound.functions";
import { composeLinkedInTagline } from "@/lib/tagline.functions";
import { decodeDraft } from "@/lib/draftLink";
import { streamImage } from "@/lib/streamImage";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ACCEPT_MIME,
  MAX_SIZE,
  inputCls,
  btnCls,
  mimeKind,
  localToIso,
  isoToLocal,
  fileToBase64,
  mediaSrc,
} from "@/lib/outbound-helpers";
import type { MediaValue } from "@/lib/outbound-helpers";
import { Card, StatusBadge } from "@/components/outbound/Card";
import { DropZone } from "@/components/outbound/DropZone";

const authHeader = async (): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const Route = createFileRoute("/_authenticated/outbound")({
  validateSearch: (s: Record<string, unknown>) => ({
    draft: typeof s.draft === "string" ? s.draft : undefined,
    queue: s.queue === "fallbacks" ? ("fallbacks" as const) : undefined,
  }),
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
  const fetchFull = useServerFn(getOutboundFull);
  const archiveRow = useServerFn(setOutboundArchived);

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
  const [liOpen, setLiOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [rowOpen, setRowOpen] = useState<Record<string, boolean>>({});
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
  const [editMedia, setEditMedia] = useState<MediaValue | null>(null);
  const editPdfInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);
  const [editKlingPrompt, setEditKlingPrompt] = useState("");
  const [editKlingNarration, setEditKlingNarration] = useState("");
  const [editKlingElapsed, setEditKlingElapsed] = useState(0);
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
  const [postMedia, setPostMedia] = useState<MediaValue | null>(null);
  const [klingPrompt, setKlingPrompt] = useState("");
  const [klingNarration, setKlingNarration] = useState("");
  const [klingBusy, setKlingBusy] = useState(false);
  const [klingElapsed, setKlingElapsed] = useState(0);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // main card drag-drop
  const [mainDragOver, setMainDragOver] = useState(false);

  // Row preview modal
  const [previewing, setPreviewing] = useState<any | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; kind: "image" | "pdf" | "video"; mime: string; filename: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const emailRef = useRef<HTMLElement>(null);
  const reminderRef = useRef<HTMLElement>(null);
  const liRef = useRef<HTMLElement>(null);
  const startKling = useServerFn(startKlingJob);
  const pollKling = useServerFn(pollKlingJob);
  const getMediaUrl = useServerFn(getOutboundMediaUrl);

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

  // Start Kling + poll loop. Polls until completed or failed (no time cap).
  async function runKlingFlow(opts: {
    prompt: string;
    narration?: string;
    onTick?: (elapsedSec: number) => void;
  }): Promise<{ media: MediaValue }> {
    const started = Date.now();
    const job = await startKling({ data: { prompt: opts.prompt, narration: opts.narration } });
    // Poll forever until terminal state. The server returns explicit
    // processing/completed/failed; we never give up on the client side.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 5000));
      opts.onTick?.(Math.floor((Date.now() - started) / 1000));
      let res;
      try {
        res = await pollKling({ data: { jobId: job.jobId, pollingUrl: job.pollingUrl ?? undefined } });
      } catch (e) {
        // transient network error — keep polling
        continue;
      }
      if (res.status === "processing") continue;
      if (res.status === "failed") throw new Error(res.error);
      return {
        media: {
          kind: "video",
          url: res.videoUrl,
          path: res.videoPath,
          mime: res.videoMime,
          filename: res.videoFilename,
        },
      };
    }
  }

  async function openPreview(r: any) {
    setPreviewing(r);
    setPreviewMedia(null);
    setPreviewBusy(true);
    try {
      const p = (r.payload ?? {}) as Record<string, any>;
      if (p.mediaPath) {
        const res = await getMediaUrl({ data: { id: r.id } });
        if (!res.url || !res.kind) throw new Error("Media not found");
        setPreviewMedia({ url: res.url, kind: res.kind, mime: res.mime ?? "", filename: res.filename ?? "" });
      } else {
        const full = await fetchFull({ data: { id: r.id } });
        const fp = (full?.payload ?? {}) as Record<string, any>;
        if (fp.mediaBase64 && fp.mediaKind) {
          setPreviewMedia({
            url: `data:${fp.mediaMime || "application/octet-stream"};base64,${fp.mediaBase64}`,
            kind: fp.mediaKind, mime: fp.mediaMime ?? "", filename: fp.mediaFilename ?? "",
          });
        } else if (fp.imageBase64) {
          setPreviewMedia({
            url: `data:image/png;base64,${fp.imageBase64}`,
            kind: "image", mime: "image/png", filename: "image.png",
          });
        } else {
          throw new Error("No media attached");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load preview");
      setPreviewing(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  function closePreview() {
    setPreviewing(null);
    setPreviewMedia(null);
    setPreviewBusy(false);
  }

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

  async function archiveItem(id: string) {
    setRowBusy(id);
    try {
      await archiveRow({ data: { id, archived: true } });
      toast.success("Archived");
      qc.invalidateQueries({ queryKey: ["my-outbound"] });
      qc.invalidateQueries({ queryKey: ["outbound", "archive"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    } finally {
      setRowBusy(null);
    }
  }

  async function openEdit(r: any) {
    if (r.status !== "pending") return;
    // Hydrate the full payload — list view strips media blobs to sentinels like "[pdf]"
    let p = (r.payload ?? {}) as Record<string, any>;
    setEditing(r);
    setEditImgB64(null);
    setEditImgUrl(null);
    setEditImgFinal(false);
    setCarouselVariants([]);
    setEditImgDescription("");
    setEditMedia(null);
    setEditKlingPrompt("");
    setEditKlingNarration("");
    try {
      const full = await fetchFull({ data: { id: r.id } });
      if (full?.payload) p = full.payload;
    } catch {
      // fall back to stripped payload silently
    }
    const localSched = isoToLocal(p.scheduled_at);
    if (r.kind === "outbound_linkedin") {
      setEditDraft({ text: p.text ?? "", scheduled_at: localSched });
      // Prefer storage path → fresh signed URL
      if (p.mediaPath && p.mediaKind) {
        try {
          const res = await getMediaUrl({ data: { id: r.id } });
          if (res.url && res.kind) {
            setEditMedia({
              kind: res.kind, url: res.url, path: p.mediaPath,
              mime: res.mime || "", filename: res.filename || "",
            });
          }
        } catch {
          /* fall through to base64 if any */
        }
      } else if (p.mediaBase64 && !String(p.mediaBase64).startsWith("[") && p.mediaKind) {
        setEditMedia({
          kind: p.mediaKind as "image" | "pdf" | "video",
          base64: p.mediaBase64,
          mime: p.mediaMime || (p.mediaKind === "pdf" ? "application/pdf" : p.mediaKind === "video" ? "video/mp4" : "image/png"),
          filename: p.mediaFilename || "",
        });
      } else if (p.imageBase64 && !String(p.imageBase64).startsWith("[")) {
        setEditImgB64(p.imageBase64);
        setEditImgUrl(`data:image/png;base64,${p.imageBase64}`);
        setEditImgFinal(true);
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
    setEditKlingNarration("");
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
          payload.mediaMime = editMedia.mime;
          payload.mediaFilename = editMedia.filename;
          if (editMedia.path) {
            payload.mediaPath = editMedia.path;
            payload.mediaBase64 = null;
          } else if (editMedia.base64) {
            payload.mediaBase64 = editMedia.base64;
            payload.mediaPath = null;
          }
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
        <FallbacksQueue
          rows={data?.rows ?? []}
          isOwner={owner.data?.isOwner === true}
          openWhen={search.queue === "fallbacks"}
          onEdit={openEdit}
          onArchive={archiveItem}
          onApproveAll={async (ids) => {
            for (const id of ids) {
              try { await approveReq({ data: { id } }); } catch (e) {
                toast.error(e instanceof Error ? e.message : "Approve failed");
              }
            }
            toast.success(`${ids.length} fallback${ids.length === 1 ? "" : "s"} approved & sent`);
            qc.invalidateQueries({ queryKey: ["my-outbound"] });
          }}
          onArchiveAll={async (ids) => {
            for (const id of ids) {
              try { await archiveRow({ data: { id, archived: true } }); } catch (e) {
                toast.error(e instanceof Error ? e.message : "Archive failed");
              }
            }
            toast.success(`${ids.length} fallback${ids.length === 1 ? "" : "s"} archived`);
            qc.invalidateQueries({ queryKey: ["my-outbound"] });
            qc.invalidateQueries({ queryKey: ["outbound", "archive"] });
          }}
        />
        <section className="rounded-lg border border-border bg-panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-serif text-lg font-semibold">My recent requests</h2>
            <div className="ml-auto flex items-center gap-2">
              <Link
                to="/outbound/archive"
              search={{}}
                search={{}}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
              >
                <Archive className="h-3 w-3" />
                Archive
              </Link>
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
                aria-expanded={listOpen}
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${listOpen ? "rotate-180" : ""}`} />
                {listOpen ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {listOpen && (
            <>
              {!data?.rows?.length && <p className="text-xs text-muted-foreground">Nothing submitted yet.</p>}
              <ul className="divide-y divide-border">
                {data?.rows?.map((r: any) => {
                  const p = (r.payload ?? {}) as Record<string, string>;
                  const clickable = r.status === "pending";
                  const isOpen = !!rowOpen[r.id];
                  const summary = p.subject ?? p.text ?? p.to ?? "";
                  const summaryLine = summary.split("\n")[0]?.slice(0, 120) ?? "";
                  return (
                    <li key={r.id} className="py-3">
                      <div
                        className={`flex items-start justify-between gap-3 ${clickable ? "cursor-pointer rounded-md px-2 -mx-2 hover:bg-muted/40" : ""}`}
                        onClick={clickable ? () => openEdit(r) : undefined}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setRowOpen((s) => ({ ...s, [r.id]: !s[r.id] })); }}
                              className="inline-flex items-center justify-center rounded-md border border-border p-1 text-muted-foreground hover:bg-muted"
                              aria-expanded={isOpen}
                              title={isOpen ? "Collapse" : "Expand"}
                            >
                              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </button>
                            <span className="font-medium uppercase tracking-wider text-muted-foreground">
                              {r.kind.replace("outbound_", "")}
                            </span>
                            <StatusBadge status={r.status} />
                            {clickable && (
                              <span className="text-[10px] text-primary">Click to edit</span>
                            )}
                          </div>
                          {!isOpen && summaryLine && (
                            <p className="mt-1 truncate text-sm">{summaryLine}</p>
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
                            {(p.mediaKind || p.mediaPath || p.imageBase64) && (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                                disabled={rowBusy === r.id}
                                onClick={(e) => { e.stopPropagation(); openPreview(r); }}
                                title={`Preview ${p.mediaKind ?? "image"}`}
                              >
                                {p.mediaKind === "video" ? <Film className="h-3.5 w-3.5" />
                                  : p.mediaKind === "pdf" ? <FileText className="h-3.5 w-3.5" />
                                  : <ImageIcon className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                              disabled={rowBusy === r.id}
                              onClick={(e) => { e.stopPropagation(); archiveItem(r.id); }}
                              title="Archive"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
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
                      </div>
                      {isOpen && (
                        <div className="mt-2 px-2 -mx-2">
                          {summary && (
                            <p className="whitespace-pre-wrap break-words text-sm">{summary}</p>
                          )}
                          {p.body && p.body !== summary && (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{p.body}</p>
                          )}
                          {p.scheduled_at && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                              <Clock className="h-3 w-3" /> Scheduled: {new Date(p.scheduled_at).toLocaleString()}
                            </p>
                          )}
                          {r.notes && r.status !== "sent" && (
                            <p className="mt-1 text-xs text-muted-foreground">Note: {r.notes}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

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


        <Card
          title="LinkedIn post"
          icon={Linkedin}
          refEl={liRef}
          collapsible
          open={liOpen}
          onToggle={() => setLiOpen((v) => !v)}
          headerRight={
            <Link
              to="/outbound/archive"
              search={{}}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
            >
              <Archive className="h-3 w-3" />
              Archive
            </Link>
          }
        >
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
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <input className={inputCls + " flex-1"} placeholder="Describe a clip to generate with Kling…"
                    value={klingPrompt} onChange={(e) => setKlingPrompt(e.target.value)} disabled={klingBusy} />
                  <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                    disabled={klingBusy || !klingPrompt.trim()}
                    onClick={async () => {
                      setKlingBusy(true);
                      setKlingElapsed(0);
                      try {
                        const r = await runKlingFlow({
                          prompt: klingPrompt,
                          narration: klingNarration.trim() || post.trim() || undefined,
                          onTick: (s) => setKlingElapsed(s),
                        });
                        setPostMedia(r.media);
                        toast.success("Kling clip ready — preview below");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Kling generation failed");
                      } finally { setKlingBusy(false); setKlingElapsed(0); }
                    }}>
                    {klingBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {klingBusy ? "Generating…" : "Generate clip"}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Narration is generated automatically from your LinkedIn post text.
                </p>
                {klingBusy && (
                  <p className="text-[10px] text-muted-foreground">
                    Generating video… {Math.floor(klingElapsed / 60)}:{String(klingElapsed % 60).padStart(2, "0")} (Kling typically takes 2–5 min)
                  </p>
                )}
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
                      imageBase64: !postMedia && imgFinal ? imgB64 : null,
                      mediaKind: postMedia?.kind ?? null,
                      mediaBase64: postMedia?.base64 ?? null,
                      mediaPath: postMedia?.path ?? null,
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

      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:items-center sm:p-4"
          onClick={closeEdit}
        >
          <div
            className="my-4 w-full max-w-lg rounded-lg border border-border bg-panel p-4 shadow-xl sm:p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <input className={inputCls + " flex-1"} placeholder="Describe a clip to generate with Kling…"
                          value={editKlingPrompt} onChange={(e) => setEditKlingPrompt(e.target.value)} disabled={!!editBusy} />
                        <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                          disabled={!!editBusy || !editKlingPrompt.trim()}
                          onClick={async () => {
                            setEditBusy("kling");
                            setEditKlingElapsed(0);
                            try {
                              const r = await runKlingFlow({
                                prompt: editKlingPrompt,
                                narration: editKlingNarration.trim() || editDraft.text?.trim() || undefined,
                                onTick: (s) => setEditKlingElapsed(s),
                              });
                              setEditMedia(r.media);
                              toast.success("Kling clip ready — preview below");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Kling failed");
                            } finally { setEditBusy(null); setEditKlingElapsed(0); }
                          }}>
                          {editBusy === "kling" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          {editBusy === "kling" ? "Generating…" : "Generate"}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Narration is generated automatically from the post text for this draft.
                      </p>
                      {editBusy === "kling" && (
                        <p className="text-[10px] text-muted-foreground">
                          Generating video… {Math.floor(editKlingElapsed / 60)}:{String(editKlingElapsed % 60).padStart(2, "0")} (Kling typically takes 2–5 min)
                        </p>
                      )}
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

      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:items-center sm:p-4"
          onClick={closePreview}
        >
          <div
            className="my-4 w-full max-w-2xl rounded-lg border border-border bg-panel p-4 shadow-xl sm:p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-serif text-lg font-semibold">
                Preview {previewMedia?.kind ?? ""} {previewMedia?.filename && <span className="ml-2 text-xs text-muted-foreground">{previewMedia.filename}</span>}
              </h3>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={closePreview}>✕</button>
            </div>
            {previewBusy && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!previewBusy && previewMedia && (
              <div className="flex flex-col items-center gap-3">
                {previewMedia.kind === "video" && (
                  <video src={previewMedia.url} controls autoPlay className="max-h-[70vh] w-full rounded-md" />
                )}
                {previewMedia.kind === "image" && (
                  <img src={previewMedia.url} alt={previewMedia.filename} className="max-h-[70vh] w-full object-contain" />
                )}
                {previewMedia.kind === "pdf" && (
                  <>
                    <iframe src={previewMedia.url} className="h-[70vh] w-full rounded-md border border-border" title={previewMedia.filename} />
                    <a href={previewMedia.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Open in new tab</a>
                  </>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted"
                onClick={closePreview}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FallbacksQueue(props: {
  rows: any[];
  isOwner: boolean;
  openWhen?: boolean;
  onEdit: (r: any) => void;
  onArchive: (id: string) => void;
  onApproveAll: (ids: string[]) => Promise<void>;
  onArchiveAll: (ids: string[]) => Promise<void>;
}) {
  const fallbacks = props.rows.filter(
    (r) =>
      r.kind === "outbound_linkedin" &&
      r.payload?.parser_fallback === true &&
      r.archived_at == null &&
      r.status === "pending",
  );
  const [open, setOpen] = useState<boolean>(props.openWhen ?? false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<"approve" | "archive" | null>(null);

  useEffect(() => {
    if (props.openWhen) setOpen(true);
  }, [props.openWhen]);

  if (fallbacks.length === 0 && !props.openWhen) return null;

  const selectedIds = fallbacks.filter((r) => selected[r.id]).map((r) => r.id);
  const targetIds = selectedIds.length > 0 ? selectedIds : fallbacks.map((r) => r.id);

  async function runBulk(action: "approve" | "archive") {
    if (targetIds.length === 0) return;
    const verb = action === "approve" ? "approve & send" : "archive";
    const scope = selectedIds.length > 0 ? `${targetIds.length} selected` : `all ${targetIds.length}`;
    if (!confirm(`${verb} ${scope} fallback draft${targetIds.length === 1 ? "" : "s"}?`)) return;
    setBusy(action);
    try {
      if (action === "approve") await props.onApproveAll(targetIds);
      else await props.onArchiveAll(targetIds);
      setSelected({});
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h2 className="font-serif text-lg font-semibold">Parser Fallbacks</h2>
        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          {fallbacks.length}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
          aria-expanded={open}
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Drafts the parser couldn't structure. Each was filed as a single LinkedIn draft from the
            raw chat text. Edit individually, or batch-approve/archive below.
          </p>
          {fallbacks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending fallback drafts.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {props.isOwner && (
                  <button
                    type="button"
                    disabled={busy !== null || targetIds.length === 0}
                    onClick={() => runBulk("approve")}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === "approve" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Approve {selectedIds.length > 0 ? `${selectedIds.length} selected` : "all"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null || targetIds.length === 0}
                  onClick={() => runBulk("archive")}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted disabled:opacity-50"
                >
                  {busy === "archive" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                  Archive {selectedIds.length > 0 ? `${selectedIds.length} selected` : "all"}
                </button>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected({})}
                    className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <ul className="divide-y divide-border">
                {fallbacks.map((r) => {
                  const p = (r.payload ?? {}) as Record<string, any>;
                  const hashShort = typeof p.text_hash === "string" ? p.text_hash.slice(0, 10) : "";
                  const preview = (p.text_preview ?? p.text ?? "").slice(0, 240);
                  const isSel = !!selected[r.id];
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          aria-label="Select fallback"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                              Fallback
                            </span>
                            <span>{new Date(r.created_at).toLocaleString()}</span>
                            {hashShort && (
                              <span title={p.text_hash} className="font-mono normal-case tracking-normal text-muted-foreground">
                                #{hashShort}
                              </span>
                            )}
                            {typeof p.text_length === "number" && (
                              <span className="normal-case tracking-normal">{p.text_length} chars</span>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                            {preview}
                            {p.text_length > preview.length ? "…" : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <button
                            type="button"
                            onClick={() => props.onEdit(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted"
                          >
                            <Wand2 className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onArchive(r.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
                          >
                            <Archive className="h-3 w-3" />
                            Archive
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
