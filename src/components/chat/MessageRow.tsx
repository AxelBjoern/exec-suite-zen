import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Copy, Check, Send as SendIcon, Users, ChevronDown, ChevronRight } from "lucide-react";
import { VdnxLoader } from "@/components/VdnxLoader";
import { ArtifactPill, type DocArtifact } from "@/components/ArtifactDrawer";
import { filePlanFromChat, fileLinkedInDrafts } from "@/lib/outbound.functions";
import { getSwarmDrafts } from "@/serverfns/swarm.functions";
import { copyToClipboard, formatBytes, type Attachment } from "@/lib/chat-helpers";

export function MessageRow({
  role,
  content,
  attachments,
  artifact,
  modelUsed,
  onOpenArtifact,
  linkedInAuthoring = false,
  swarmRun = null,
}: {
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  artifact?: DocArtifact | null;
  modelUsed?: string | null;
  onOpenArtifact?: (a: DocArtifact) => void;
  linkedInAuthoring?: boolean;
  swarmRun?: { id: string; synth_model: string; drafter_models: string[]; status: string } | null;
}) {

  const videoAtts = attachments.filter((a) => a.url && a.mimeType?.startsWith("video/"));
  const imageAtts = attachments.filter((a) => a.url && a.mimeType?.startsWith("image/"));
  const audioAtts = attachments.filter((a) => a.url && a.mimeType?.startsWith("audio/"));
  const narrationByStem = new Map<string, Attachment>();
  for (const a of audioAtts) {
    if (a.filename.startsWith("narration_")) {
      const stem = a.filename.replace(/^narration_/, "").replace(/\.[^.]+$/, "");
      narrationByStem.set(stem, a);
    }
  }
  const pairedAudioIds = new Set<string>();
  const standaloneAudio = audioAtts.filter((a) => !pairedAudioIds.has(a.id));
  const mediaAtts = [...videoAtts, ...imageAtts];
  const fileAtts = attachments.filter(
    (a) => !mediaAtts.includes(a) && !audioAtts.includes(a),
  );

  const renderMedia = () =>
    (mediaAtts.length > 0 || standaloneAudio.length > 0) && (
      <div className="flex flex-wrap gap-2">
        {videoAtts.map((a) => {
          const stem = a.filename.replace(/\.[^.]+$/, "");
          const narration = narrationByStem.get(stem);
          if (narration) pairedAudioIds.add(narration.id);
          return (
            <VideoWithNarration
              key={a.id}
              videoUrl={a.url!}
              narrationUrl={narration?.url ?? null}
            />
          );
        })}
        {imageAtts.map((a) => (
          <img
            key={a.id}
            src={a.url!}
            alt={a.filename}
            className="max-w-full rounded-lg border border-border"
            style={{ maxHeight: 360 }}
          />
        ))}
        {standaloneAudio
          .filter((a) => !pairedAudioIds.has(a.id))
          .map((a) => (
            <audio key={a.id} src={a.url!} controls className="w-full" />
          ))}
      </div>
    );

  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Copy failed");
    }
  }

  if (role === "user") {
    return (
      <div className="flex justify-end group">
        <div className="max-w-[80%] space-y-2">
          {renderMedia()}
          {fileAtts.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {fileAtts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs"
                >
                  <FileText className="h-3 w-3" />
                  <span className="font-medium">{a.filename}</span>
                  <span className="text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
                </div>
              ))}
            </div>
          )}
          {content && (
            <div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {content}
            </div>
          )}
          {content && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="Copy prompt"
                title="Copy prompt"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 group">
      <div className="h-7 w-7 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary tracking-wider">
        CEO
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {renderMedia()}
        <div className="prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] text-[15px] leading-7 prose-p:my-3 prose-li:my-1 prose-ul:my-3 prose-ol:my-3 prose-headings:mt-5 prose-headings:mb-2 prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:p-3 prose-pre:text-[13px] prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-foreground prose-a:text-primary prose-a:underline-offset-2 prose-table:my-4 prose-table:w-full prose-table:text-sm prose-table:border-collapse prose-th:bg-muted/60 prose-th:font-semibold prose-th:text-left prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-border/60 prose-td:px-3 prose-td:py-2 prose-td:align-top prose-td:border prose-td:border-border/50 prose-thead:border-b prose-thead:border-border">
          <div className="overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
        {artifact && onOpenArtifact && (
          <ArtifactPill artifact={artifact} onOpen={() => onOpenArtifact(artifact)} />
        )}
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Copy reply"
            title="Copy reply"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
          <AddToOutboundButton content={content} force={linkedInAuthoring} />
          <SendPlanButton content={content} />
          {modelUsed && <ModelPill model={modelUsed} />}
          {swarmRun && <SwarmBadge run={swarmRun} />}
        </div>
        {swarmRun && <SwarmDrafts runId={swarmRun.id} />}
      </div>
    </div>
  );
}

function SwarmBadge({ run }: { run: { synth_model: string; drafter_models: string[] } }) {
  const short = (s: string) => s.split("/").pop() ?? s;
  return (
    <span
      title={`Swarm: ${run.drafter_models.map(short).join(", ")} → ${short(run.synth_model)}`}
      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
    >
      <Users className="h-3 w-3" />
      Swarm · {run.drafter_models.length}
    </span>
  );
}

type SwarmDraftRow = {
  id: string;
  model_slug: string;
  model_label: string | null;
  role: string | null;
  role_label: string | null;
  content: string | null;
  status: "ok" | "error" | string;
  error: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  confidence: number | null;
  rationale: string | null;
};

function confidenceTone(pct: number): { bar: string; text: string; label: string } {
  if (pct >= 75) return { bar: "bg-emerald-500", text: "text-emerald-500", label: "High" };
  if (pct >= 45) return { bar: "bg-amber-500", text: "text-amber-500", label: "Medium" };
  return { bar: "bg-rose-500", text: "text-rose-500", label: "Low" };
}

function SwarmDrafts({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(getSwarmDrafts);
  const { data, isLoading } = useQuery({
    queryKey: ["swarm-drafts", runId],
    queryFn: () => load({ data: { runId } }),
    enabled: open,
  });
  const drafts: SwarmDraftRow[] = ((data as any)?.drafts ?? []) as SwarmDraftRow[];
  const scored = drafts.filter((d) => typeof d.confidence === "number");
  const avgConfidence = scored.length
    ? Math.round(scored.reduce((s, d) => s + (d.confidence ?? 0), 0) / scored.length)
    : null;

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Users className="h-3 w-3" />
        Quality breakdown
        {avgConfidence !== null && (
          <span className={`ml-auto text-[10px] font-mono ${confidenceTone(avgConfidence).text}`}>
            avg {avgConfidence}%
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {isLoading && <VdnxLoader size="xs" />}
          {!isLoading && drafts.length === 0 && (
            <div className="text-[11px] text-muted-foreground">No drafts recorded for this run.</div>
          )}
          {drafts.map((d) => {
            const conf = typeof d.confidence === "number" ? Math.round(d.confidence) : null;
            const tone = conf !== null ? confidenceTone(conf) : null;
            const header = d.role_label ? `${d.role_label} · ${d.model_label ?? d.model_slug}` : (d.model_label ?? d.model_slug);
            return (
              <div key={d.id} className="rounded border border-border/50 bg-background/40 p-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold truncate">{header}</span>
                    <span className="text-[10px] font-mono text-muted-foreground truncate">
                      {d.model_slug.split("/").pop()}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {d.status === "ok" ? `${d.latency_ms ?? "—"}ms` : d.status}
                  </span>
                </div>
                {conf !== null && tone && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className={`font-semibold ${tone.text}`}>{tone.label} confidence</span>
                      <span className={`font-mono ${tone.text}`}>{conf}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${tone.bar}`} style={{ width: `${conf}%` }} />
                    </div>
                    {d.rationale && (
                      <div className="mt-1 text-[11px] italic text-muted-foreground leading-snug">
                        {d.rationale}
                      </div>
                    )}
                  </div>
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {d.status === "ok" ? (d.content ?? "") : `⚠️ ${d.error ?? d.status}`}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelPill({ model }: { model: string }) {
  const short = model.split("/").pop() ?? model;
  return (
    <span
      title={model}
      className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
    >
      {short}
    </span>
  );
}

function splitPostsClient(text: string): string[] {
  const parts = text
    .split(/\n(?:---+|\*\*\*+)\n|\n(?=#{1,4}\s*Post\s*\d+)|\n(?=\*\*Post\s*\d+)/i)
    .map((p) => p.replace(/^#{1,4}\s*Post\s*\d+\s*[:\-]?\s*/i, "").replace(/^\*\*Post\s*\d+\*\*\s*[:\-]?\s*/i, "").trim())
    .filter((p) => p.length >= 20);
  return parts.length ? parts : [text.trim()];
}

function looksLikeLinkedInDraft(text: string): boolean {
  const t = text.trim();
  if (t.length < 200) return false;
  if (/\?\s*$/.test(t)) return false;
  if (/^(you'?ve already|to publish|copy post|the posts are|i can'?t|📨|✅)/i.test(t)) return false;
  // Relaxed: length + not a pure question/apology is enough.
  return true;
}

function AddToOutboundButton({ content, force = false }: { content: string; force?: boolean }) {
  const fileDrafts = useServerFn(fileLinkedInDrafts);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const trimmed = content.trim();
  const eligible = force ? trimmed.length >= 80 : looksLikeLinkedInDraft(content);
  if (!eligible) return null;
  const n = splitPostsClient(content).length;

  async function handleClick() {
    if (busy || done) return;
    setBusy(true);
    const t = toast.loading("Adding to Outbound…");
    try {
      const res: any = await fileDrafts({ data: { text: content } });
      toast.dismiss(t);
      const count = res?.count ?? 0;
      if (count > 0) {
        setDone(true);
        toast.success(`Added ${count} post${count === 1 ? "" : "s"} to Outbound`, {
          action: { label: "Review", onClick: () => { window.location.href = "/outbound"; } },
        });
      } else {
        toast.error(res?.errors?.[0] ?? "Nothing to file — reply had no post body");
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e?.message ?? "Failed to add to Outbound");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || done}
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
      title="File this draft to Outbound as pending"
    >
      {busy ? <VdnxLoader size="xs" /> : done ? <Check className="h-3 w-3" /> : <SendIcon className="h-3 w-3" />}
      {done ? "Added ✓" : busy ? "Adding…" : n > 1 ? `Add ${n} posts to Outbound` : "Add to Outbound"}
    </button>
  );
}


function SendPlanButton({ content }: { content: string }) {
  const filePlan = useServerFn(filePlanFromChat);
  const [busy, setBusy] = useState(false);
  const looksLikePlan =
    /\b(linkedin|outbound|post\s*\d|publishing plan|email\s+sequence|reminder|subject\s*:|hook\s*:|hashtag)\b/i.test(content) &&
    content.length > 80;
  if (!looksLikePlan) return null;

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Filing plan to Outbound…");
    try {
      const res: any = await filePlan({ data: { plan: content } });
      const count = res?.filed?.length ?? 0;
      const errCount = res?.errors?.length ?? 0;
      const fallback = res?.parserFallback === true;
      toast.dismiss(t);
      if (fallback && count > 0) {
        toast.warning(
          "Parser couldn't structure your plan — filed as 1 LinkedIn draft for review.",
          {
            description: res?.textHash
              ? `Logged with hash ${String(res.textHash).slice(0, 10)}…`
              : undefined,
            action: {
              label: "Review fallbacks",
              onClick: () => {
                window.location.href = "/outbound?queue=fallbacks";
              },
            },
          },
        );
      } else if (count > 0) {
        toast.success(
          `${count} draft${count === 1 ? "" : "s"} filed to Outbound${errCount ? ` (${errCount} skipped)` : ""}`,
          {
            action: {
              label: "Review",
              onClick: () => {
                window.location.href = "/outbound";
              },
            },
          },
        );
      } else {
        toast.error(res?.errors?.[0] ?? "Nothing was filed");
      }
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e?.message ?? "Failed to file plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
      title="Parse this plan and file every post/email as a pending draft in Outbound"
    >
      {busy ? <VdnxLoader size="xs" /> : <SendIcon className="h-3 w-3" />}
      {busy ? "Filing…" : "Send plan to Outbound"}
    </button>
  );
}

function VideoWithNarration({
  videoUrl,
  narrationUrl,
}: {
  videoUrl: string;
  narrationUrl: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a) return;
    const onPlay = () => {
      a.currentTime = v.currentTime;
      a.play().catch(() => {});
    };
    const onPause = () => a.pause();
    const onSeek = () => {
      a.currentTime = v.currentTime;
    };
    const onRate = () => {
      a.playbackRate = v.playbackRate;
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeek);
    v.addEventListener("ratechange", onRate);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeek);
      v.removeEventListener("ratechange", onRate);
    };
  }, [narrationUrl]);

  return (
    <div className="flex flex-col gap-1">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        muted={!!narrationUrl}
        className="max-w-full rounded-lg border border-border"
        style={{ maxHeight: 360 }}
      />
      {narrationUrl && (
        <audio ref={audioRef} src={narrationUrl} preload="auto" className="hidden" />
      )}
    </div>
  );
}
