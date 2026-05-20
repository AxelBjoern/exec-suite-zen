import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  getCeoChat,
  sendCeoMessage,
  clearCeoChat,
  uploadCeoAttachment,
  listCeoConversations,
  createCeoConversation,
  renameCeoConversation,
  deleteCeoConversation,
  generateCeoDocument,
} from "@/serverfns/ceo-chat.functions";
import { CHAT_MODEL_OPTIONS } from "@/lib/chat-models";
import {
  ArtifactDrawer,
  ArtifactPill,
  parseArtifactFromMarkdown,
  type DocArtifact,
} from "@/components/ArtifactDrawer";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Send,
  Trash2,
  Loader2,
  Paperclip,
  X,
  FileText,
  Plus,
  MessageSquare,
  Pencil,
  FileDown,
  FileType,
  Copy,
  Check,
  Menu,
  Square,
  Upload,
} from "lucide-react";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat — VDNX CEO Agent" },
      {
        name: "description",
        content: "Direct conversational chat with the VDNX CEO agent.",
      },
    ],
  }),
  component: ChatPage,
});

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  attachments?: Attachment[];
  artifact_json?: DocArtifact | null;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

const MODEL_STORAGE_KEY = "ceo-chat-model";
const ACTIVE_CONVO_KEY = "ceo-chat-active";
const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

function ChatPage() {
  const load = useServerFn(getCeoChat);
  const send = useServerFn(sendCeoMessage);
  const clear = useServerFn(clearCeoChat);
  const upload = useServerFn(uploadCeoAttachment);
  const listConvos = useServerFn(listCeoConversations);
  const createConvo = useServerFn(createCeoConversation);
  const renameConvo = useServerFn(renameCeoConversation);
  const deleteConvo = useServerFn(deleteCeoConversation);
  const genDoc = useServerFn(generateCeoDocument);
  const qc = useQueryClient();

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_CONVO_KEY);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeId) localStorage.setItem(ACTIVE_CONVO_KEY, activeId);
    else localStorage.removeItem(ACTIVE_CONVO_KEY);
  }, [activeId]);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["ceo-conversations"],
    queryFn: () => listConvos() as Promise<Conversation[]>,
  });

  // If no active id, default to the most recent conversation
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
    // If active id is stale (deleted), reset
    if (activeId && conversations.length > 0 && !conversations.find((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["ceo-chat", activeId],
    queryFn: () => load({ data: { conversationId: activeId } }) as Promise<Msg[]>,
  });

  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState<{
    content: string;
    attachments: Attachment[];
  } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [model, setModel] = useState<string>(CHAT_MODEL_OPTIONS[0].id);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openArtifact, setOpenArtifact] = useState<DocArtifact | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastAutoOpenedArtifactRef = useRef<string | null>(null);

  // Hydrate model from localStorage post-mount to avoid SSR/client mismatch
  useEffect(() => {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) setModel(stored);
    setHydrated(true);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hydrated) localStorage.setItem(MODEL_STORAGE_KEY, model);
  }, [model, hydrated]);


  const mutation = useMutation({
    mutationFn: async (vars: { content: string; attachmentIds: string[] }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return send({
        data: {
          content: vars.content,
          model,
          attachmentIds: vars.attachmentIds,
          conversationId: activeId,
        },
        signal: controller.signal,
      });
    },
    onMutate: (vars) => {
      setPendingUser({ content: vars.content, attachments: [...attachments] });
      setAttachments([]);
    },
    onSettled: async (saved: any) => {
      abortRef.current = null;
      setPendingUser(null);
      // Server may have auto-created a conversation; adopt it
      const newId = saved?.conversation_id ?? activeId;
      if (newId && newId !== activeId) setActiveId(newId);
      await qc.invalidateQueries({ queryKey: ["ceo-chat"] });
      await qc.invalidateQueries({ queryKey: ["ceo-conversations"] });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (e: any) => {
      if (e?.name === "AbortError" || /abort/i.test(e?.message ?? "")) {
        toast.info("Message stopped");
        return;
      }
      toast.error(e?.message ?? "Send failed");
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => clear({ data: { conversationId: activeId } }),
    onSuccess: () => {
      qc.setQueryData(["ceo-chat", activeId], []);
      toast.success("Conversation cleared");
    },
  });

  const newConvoMutation = useMutation({
    mutationFn: async () => createConvo({ data: { title: "New conversation" } }),
    onSuccess: (convo: any) => {
      setActiveId(convo.id);
      qc.invalidateQueries({ queryKey: ["ceo-conversations"] });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  const deleteConvoMutation = useMutation({
    mutationFn: async (id: string) => deleteConvo({ data: { id } }),
    onSuccess: (_d, id) => {
      if (activeId === id) setActiveId(null);
      qc.invalidateQueries({ queryKey: ["ceo-conversations"] });
      toast.success("Conversation deleted");
    },
  });

  const renameConvoMutation = useMutation({
    mutationFn: async (v: { id: string; title: string }) =>
      renameConvo({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ceo-conversations"] }),
  });

  const docMutation = useMutation({
    mutationFn: async (vars: { kind: "pdf" | "docx"; topic: string }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return genDoc({
        data: {
          kind: vars.kind,
          topic: vars.topic,
          conversationId: activeId,
          model,
        },
        signal: controller.signal,
      });
    },
    onMutate: (vars) => {
      setPendingUser({
        content: `/${vars.kind} ${vars.topic}`,
        attachments: [],
      });
    },
    onSettled: async (saved: any) => {
      abortRef.current = null;
      setPendingUser(null);
      const newId = saved?.conversation_id ?? activeId;
      if (newId && newId !== activeId) setActiveId(newId);
      await qc.invalidateQueries({ queryKey: ["ceo-chat"] });
      await qc.invalidateQueries({ queryKey: ["ceo-conversations"] });
      const artifact = (saved?.artifact_json as DocArtifact | undefined) ??
        (saved?.content ? parseArtifactFromMarkdown(saved.content) : null);
      if (artifact) setOpenArtifact(artifact);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (e: any) => {
      if (e?.name === "AbortError" || /abort/i.test(e?.message ?? "")) {
        toast.info("Generation stopped");
        return;
      }
      toast.error(e?.message ?? "Document generation failed");
    },
  });

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pendingUser, mutation.isPending, docMutation.isPending]);

  useEffect(() => {
    const latestArtifactMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && (message.artifact_json ?? parseArtifactFromMarkdown(message.content)));

    if (!latestArtifactMessage) return;

    const artifact = latestArtifactMessage.artifact_json ?? parseArtifactFromMarkdown(latestArtifactMessage.content);
    if (!artifact) return;

    const artifactKey = `${latestArtifactMessage.id}:${artifact.url}:${artifact.previewUrl ?? ""}`;
    if (lastAutoOpenedArtifactRef.current === artifactKey) return;

    lastAutoOpenedArtifactRef.current = artifactKey;
    setOpenArtifact(artifact);
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10MB`);
          continue;
        }
        const base64 = await readFileAsBase64(file);
        const result = (await upload({
          data: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            base64,
          },
        })) as Attachment;
        setAttachments((prev) => [...prev, result]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (mutation.isPending || docMutation.isPending || uploading) return;
    if (!text && attachments.length === 0) return;

    // Slash commands: /pdf <topic>  or  /docx <topic>  (also tolerates /pdf@topic, /pdf:topic, /pdf topic)
    const slash = text.match(/^\/(pdf|docx)\b[\s:@-]*([\s\S]*)$/i);
    if (slash && attachments.length === 0) {
      const kind = slash[1].toLowerCase() as "pdf" | "docx";
      let topic = slash[2].trim();
      if (!topic) {
        topic =
          window.prompt(
            `What should the ${kind.toUpperCase()} cover? (e.g. "Q1 board update on growth and burn")`,
          )?.trim() ?? "";
      }
      if (!topic) return;
      setInput("");
      docMutation.mutate({ kind, topic });
      return;
    }

    setInput("");
    mutation.mutate({
      content: text,
      attachmentIds: attachments.map((a) => a.id),
    });
  }

  function handleGenerateDoc(kind: "pdf" | "docx") {
    const seed = input.trim();
    const topic =
      seed ||
      window.prompt(
        `What should the ${kind.toUpperCase()} cover? (e.g. "Q1 board update on growth and burn")`,
      ) ||
      "";
    if (!topic.trim()) return;
    setInput("");
    docMutation.mutate({ kind, topic: topic.trim() });
  }


  function handleRename(c: Conversation) {
    const next = window.prompt("Rename conversation", c.title);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === c.title) return;
    renameConvoMutation.mutate({ id: c.id, title: trimmed });
  }

  function handleDelete(c: Conversation) {
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    deleteConvoMutation.mutate(c.id);
  }

  const activeModelLabel = useMemo(
    () =>
      CHAT_MODEL_OPTIONS.find((m) => m.id === model)?.label ??
      CHAT_MODEL_OPTIONS[0].label,
    [model],
  );

  const showThinking = mutation.isPending;
  const showGenerating = docMutation.isPending;
  const canSend =
    (input.trim().length > 0 || attachments.length > 0) &&
    !mutation.isPending &&
    !docMutation.isPending &&
    !uploading;

  return (
    <div className="h-screen bg-background text-foreground flex">
      {/* ── Mobile backdrop ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar: conversation history ──────────────────────────────── */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 border-r border-border/40 bg-card md:bg-card/30 backdrop-blur flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="px-4 py-4 border-b border-border/40 flex items-center gap-2">
          <Link
            to="/terminal"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Back to terminal"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              VDNX
            </div>
            <div className="text-sm font-semibold tracking-tight">History</div>
          </div>
          <ThemeToggle />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => newConvoMutation.mutate()}
            disabled={newConvoMutation.isPending}
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No conversations yet. Start chatting or click <Plus className="inline h-3 w-3" /> to create one.
            </div>
          )}
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <div
                key={c.id}
                className={`group relative mx-2 mb-1 rounded-md transition-colors ${
                  active
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(c.id);
                    setSidebarOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 pr-14"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="text-sm font-medium truncate">{c.title}</div>
                  </div>
                  <div className="mt-0.5 pl-5 text-[10px] text-muted-foreground">
                    {formatRelative(c.updated_at)}
                  </div>
                </button>
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRename(c);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background/80"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(c);
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-background/80"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Main: chat panel ───────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        onDragEnter={(e) => {
          if (!e.dataTransfer?.types?.includes("Files")) return;
          e.preventDefault();
          dragDepthRef.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(e) => {
          if (!e.dataTransfer?.types?.includes("Files")) return;
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer?.files?.length) return;
          e.preventDefault();
          dragDepthRef.current = 0;
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
            <div className="flex flex-col items-center gap-3 text-primary">
              <Upload className="h-10 w-10" />
              <div className="text-sm font-medium uppercase tracking-[0.2em]">
                Drop files to attach
              </div>
              <div className="text-xs text-muted-foreground">
                .pdf, .docx, .txt, .md · up to 10MB each
              </div>
            </div>
          </div>
        )}
        <header className="border-b border-border/40 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2 bg-card/40 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 md:hidden shrink-0"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="hidden md:block text-xs uppercase tracking-[0.2em] text-muted-foreground">
                VDNX
              </div>
              <h1 className="text-sm md:text-lg font-semibold tracking-tight truncate">
                CEO Agent
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8 w-[120px] md:w-[180px] text-xs">
                <SelectValue>{hydrated ? activeModelLabel : CHAT_MODEL_OPTIONS[0].label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CHAT_MODEL_OPTIONS.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearMutation.mutate()}
              disabled={
                clearMutation.isPending || messages.length === 0 || !activeId
              }
              className="text-muted-foreground hover:text-destructive px-2"
              aria-label="Clear conversation"
            >
              <Trash2 className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Clear</span>
            </Button>
          </div>
        </header>


        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
          <div className="max-w-3xl mx-auto py-8 space-y-8">
            {messages.length === 0 && !pendingUser && (
              <div className="text-center py-20 text-muted-foreground">
                <div className="text-sm uppercase tracking-[0.2em] mb-3">
                  Start the conversation
                </div>
                <p className="text-base">
                  Ask the CEO agent anything — strategy, decisions, delegation,
                  opinions. Attach docs with the paperclip, or generate a{" "}
                  <span className="text-foreground font-medium">PDF</span> /{" "}
                  <span className="text-foreground font-medium">DOCX</span>{" "}
                  using <code className="text-xs">/pdf</code> or{" "}
                  <code className="text-xs">/docx</code>.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <MessageRow
                key={m.id}
                role={m.role}
                content={m.content}
                attachments={m.attachments ?? []}
                artifact={m.artifact_json ?? parseArtifactFromMarkdown(m.content)}
                onOpenArtifact={setOpenArtifact}
              />
            ))}

            {pendingUser && (
              <MessageRow
                role="user"
                content={pendingUser.content}
                attachments={pendingUser.attachments}
              />
            )}

            {showThinking && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm pl-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                CEO is thinking…
              </div>
            )}

            {showGenerating && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm pl-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating document…
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border/40 bg-card/40 backdrop-blur">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-4">
            {(attachments.length > 0 || uploading) && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{a.filename}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(a.sizeBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter((x) => x.id !== a.id),
                        )
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${a.filename}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {uploading && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting…
                  </div>
                )}
              </div>
            )}
            <div className="relative rounded-xl border border-border bg-background focus-within:border-primary/60 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Message the CEO… (Enter to send, Shift+Enter for newline)"
                rows={2}
                disabled={mutation.isPending || docMutation.isPending}
                className="w-full resize-none bg-transparent pt-3 pb-12 px-3 pr-14 text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"

              />
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                hidden
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="absolute left-1.5 bottom-1.5 flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || mutation.isPending || docMutation.isPending}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  aria-label="Attach document"
                  title="Attach .pdf, .docx, .txt, .md"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => handleGenerateDoc("pdf")}
                  disabled={docMutation.isPending || mutation.isPending}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  aria-label="Generate PDF"
                  title="Generate PDF (or type /pdf <topic>)"
                >
                  <FileDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => handleGenerateDoc("docx")}
                  disabled={docMutation.isPending || mutation.isPending}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  aria-label="Generate Word document"
                  title="Generate DOCX (or type /docx <topic>)"
                >
                  <FileType className="h-4 w-4" />
                </Button>
              </div>
              {mutation.isPending || docMutation.isPending ? (
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Stop generation"
                  title="Stop generating"
                  className="absolute right-2 bottom-2 h-9 w-9 rounded-full flex items-center justify-center bg-foreground text-background shadow-sm transition-all hover:scale-105 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-sm bg-background/40" />
                    <span className="relative h-2.5 w-2.5 rounded-[2px] bg-background" />
                  </span>
                </button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  className="absolute right-2 bottom-2 h-9 w-9"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
      <Toaster theme="dark" position="top-right" />
      <ArtifactDrawer
        artifact={openArtifact}
        open={!!openArtifact}
        onOpenChange={(o) => !o && setOpenArtifact(null)}
      />
    </div>
  );
}

function MessageRow({
  role,
  content,
  attachments,
  artifact,
  onOpenArtifact,
}: {
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  artifact?: DocArtifact | null;
  onOpenArtifact?: (a: DocArtifact) => void;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          {attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs"
                >
                  <FileText className="h-3 w-3" />
                  <span className="font-medium">{a.filename}</span>
                  <span className="text-muted-foreground">
                    {formatBytes(a.sizeBytes)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {content && (
            <div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
              {content}
            </div>
          )}
        </div>
      </div>
    );
  }
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const ta = document.createElement("textarea");
        ta.value = content;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div className="flex gap-3 group">
      <div className="h-7 w-7 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary tracking-wider">
        CEO
      </div>
      <div className="flex-1 min-w-0">
        <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:text-primary prose-code:break-words prose-strong:text-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {artifact && onOpenArtifact && (
          <ArtifactPill artifact={artifact} onOpen={() => onOpenArtifact(artifact)} />
        )}
        <div className="mt-2 flex items-center gap-1">
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
        </div>
      </div>
    </div>
  );
}

