import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { filePlanFromChat } from "@/lib/outbound.functions";
import { CHAT_MODEL_OPTIONS } from "@/lib/chat-models";
import { getMyModelAllowlist } from "@/lib/models.functions";
import { isVdnxOwnerEmail } from "@/lib/vdnx";
import { supabase } from "@/integrations/supabase/client";
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
  ClipboardPaste,
  Send as SendIcon,
} from "lucide-react";

import {
  copyToClipboard,
  readFileAsBase64,
  formatBytes,
  formatRelative,
  MODEL_STORAGE_KEY,
  ACTIVE_CONVO_KEY,
  ACCEPTED_TYPES,
  type Attachment,
  type Msg,
  type Conversation,
} from "@/lib/chat-helpers";

export const Route = createFileRoute("/_authenticated/chat")({
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
  // Pending state is scoped per-conversation so that switching chats mid-flight
  // never bleeds a bubble or "thinking" indicator into the wrong transcript.
  // Key "__none__" represents "no active conversation yet" (server will mint one).
  const PENDING_NONE_KEY = "__none__";
  const [pendingByConvo, setPendingByConvo] = useState<
    Record<string, { content: string; attachments: Attachment[] }>
  >({});
  const [inFlightTargets, setInFlightTargets] = useState<Set<string>>(
    () => new Set(),
  );
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

  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserEmail(data.user?.email ?? null);
    });
    return () => { active = false; };
  }, []);
  const isOwner = isVdnxOwnerEmail(userEmail);

  const allowlistFn = useServerFn(getMyModelAllowlist);
  const { data: allowlist } = useQuery({
    queryKey: ["my-model-allowlist"],
    queryFn: () => allowlistFn(),
  });
  const allowedModels = useMemo(() => {
    const allowed = new Set(allowlist?.allowed ?? CHAT_MODEL_OPTIONS.map((m) => m.id));
    return CHAT_MODEL_OPTIONS.filter((m) => allowed.has(m.id));
  }, [allowlist]);

  useEffect(() => {
    if (!allowedModels.length) return;
    if (!allowedModels.some((m) => m.id === model)) {
      setModel(allowedModels[0].id);
    }
  }, [allowedModels, model]);

  const pendingKey = activeId ?? PENDING_NONE_KEY;
  const pendingUser = pendingByConvo[pendingKey] ?? null;
  const isInFlight = inFlightTargets.has(pendingKey);

  function setPendingFor(key: string, value: { content: string; attachments: Attachment[] } | null) {
    setPendingByConvo((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }
  function markInFlight(key: string, on: boolean) {
    setInFlightTargets((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

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
      const targetConvoId = activeId; // snapshot at submit time
      const targetKey = targetConvoId ?? PENDING_NONE_KEY;
      markInFlight(targetKey, true);
      const saved = await send({
        data: {
          content: vars.content,
          model,
          attachmentIds: vars.attachmentIds,
          conversationId: targetConvoId,
        },
        signal: controller.signal,
      });
      return { saved, targetConvoId, targetKey };
    },
    onMutate: (vars) => {
      const targetKey = activeId ?? PENDING_NONE_KEY;
      setPendingFor(targetKey, {
        content: vars.content,
        attachments: [...attachments],
      });
      setAttachments([]);
    },
    onSettled: async (result) => {
      abortRef.current = null;
      const r: any = result ?? {};
      const targetKey: string = r.targetKey ?? (activeId ?? PENDING_NONE_KEY);
      const targetConvoId: string | null = r.targetConvoId ?? activeId ?? null;
      const saved: any = r.saved ?? null;
      markInFlight(targetKey, false);
      setPendingFor(targetKey, null);

      const serverConvoId: string | null = saved?.conversation_id ?? targetConvoId;
      // If user started with no active conversation, adopt the one the server
      // minted — but never override an explicit switch the user made in the meantime.
      if (targetConvoId === null && serverConvoId && activeId == null) {
        setActiveId(serverConvoId);
      }
      // If the server persisted under a different id (rare: stale id fell
      // through to a fresh row), adopt only if user is still on the snapshot.
      if (
        targetConvoId !== null &&
        serverConvoId &&
        serverConvoId !== targetConvoId &&
        activeId === targetConvoId
      ) {
        setActiveId(serverConvoId);
      }

      if (serverConvoId) {
        await qc.invalidateQueries({ queryKey: ["ceo-chat", serverConvoId] });
      }
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
    mutationFn: async () => {
      const target = activeId;
      await clear({ data: { conversationId: target } });
      return target;
    },
    onSuccess: (target) => {
      if (target) qc.setQueryData(["ceo-chat", target], []);
      toast.success("Conversation cleared");
    },
  });

  const newConvoMutation = useMutation({
    mutationFn: async () => createConvo({ data: { title: "New conversation" } }),
    onMutate: () => {
      // Open a clean slate immediately — input, attachments, pending state.
      setInput("");
      setAttachments([]);
    },
    onSuccess: (convo: any) => {
      setActiveId(convo.id);
      setPendingFor(convo.id, null);
      qc.invalidateQueries({ queryKey: ["ceo-conversations"] });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollRef.current?.scrollTo({ top: 0 });
      });
    },
  });

  const deleteConvoMutation = useMutation({
    mutationFn: async (id: string) => deleteConvo({ data: { id } }),
    onSuccess: (_d, id) => {
      if (activeId === id) setActiveId(null);
      setPendingFor(id, null);
      markInFlight(id, false);
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
      const targetConvoId = activeId;
      const targetKey = targetConvoId ?? PENDING_NONE_KEY;
      markInFlight(targetKey, true);
      const saved = await genDoc({
        data: {
          kind: vars.kind,
          topic: vars.topic,
          conversationId: targetConvoId,
          model,
        },
        signal: controller.signal,
      });
      return { saved, targetConvoId, targetKey };
    },
    onMutate: (vars) => {
      const targetKey = activeId ?? PENDING_NONE_KEY;
      setPendingFor(targetKey, {
        content: `/${vars.kind} ${vars.topic}`,
        attachments: [],
      });
    },
    onSettled: async (result) => {
      abortRef.current = null;
      const r: any = result ?? {};
      const targetKey: string = r.targetKey ?? (activeId ?? PENDING_NONE_KEY);
      const targetConvoId: string | null = r.targetConvoId ?? activeId ?? null;
      const saved: any = r.saved ?? null;
      markInFlight(targetKey, false);
      setPendingFor(targetKey, null);

      const serverConvoId: string | null = saved?.conversation_id ?? targetConvoId;
      if (targetConvoId === null && serverConvoId && activeId == null) {
        setActiveId(serverConvoId);
      }
      if (
        targetConvoId !== null &&
        serverConvoId &&
        serverConvoId !== targetConvoId &&
        activeId === targetConvoId
      ) {
        setActiveId(serverConvoId);
      }

      if (serverConvoId) {
        await qc.invalidateQueries({ queryKey: ["ceo-chat", serverConvoId] });
      }
      await qc.invalidateQueries({ queryKey: ["ceo-conversations"] });
      // Only auto-open the artifact if the user is still on the chat that produced it.
      if (activeId === serverConvoId || activeId === targetConvoId) {
        const artifact =
          (saved?.artifact_json as DocArtifact | undefined) ??
          (saved?.content ? parseArtifactFromMarkdown(saved.content) : null);
        if (artifact) setOpenArtifact(artifact);
      }
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
      setInput("");
      docMutation.mutate({ kind, topic: slash[2].trim() });
      return;
    }

    setInput("");
    mutation.mutate({
      content: text,
      attachmentIds: attachments.map((a) => a.id),
    });
  }

  function handleGenerateDoc(kind: "pdf" | "docx") {
    const topic = input.trim();
    setInput("");
    docMutation.mutate({ kind, topic });
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

  // Indicators are scoped to the active conversation only — a reply still
  // streaming for another chat shouldn't make THIS chat appear to be working.
  const showThinking = mutation.isPending && isInFlight;
  const showGenerating = docMutation.isPending && isInFlight;
  const canSend =
    (input.trim().length > 0 || attachments.length > 0) &&
    !mutation.isPending &&
    !docMutation.isPending &&
    !uploading;

  return (
    <div className="h-[calc(100vh-3.25rem)] bg-background text-foreground flex">
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
          {isOwner ? (
            <Link
              to="/terminal"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Back to terminal"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Back to hub"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
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
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
            {isOwner && (
              <Link
                to="/terminal"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors"
                title="Open VDNX Terminal"
              >
                <Square className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Terminal</span>
              </Link>
            )}
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8 w-[110px] md:w-[180px] text-xs">
                <SelectValue>{hydrated ? activeModelLabel : (allowedModels[0]?.label ?? CHAT_MODEL_OPTIONS[0].label)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedModels.map((m) => (
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
          <div key={pendingKey} className="max-w-[46rem] mx-auto py-8 space-y-10">
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

        <div className="border-t border-border/40 bg-card/40 backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (!text) {
                        toast.info("Clipboard is empty");
                        return;
                      }
                      setInput((prev) => prev + text);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    } catch {
                      toast.error("Paste failed — allow clipboard access");
                    }
                  }}
                  disabled={mutation.isPending || docMutation.isPending}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  aria-label="Paste from clipboard"
                  title="Paste from clipboard"
                >
                  <ClipboardPaste className="h-4 w-4" />
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
  const videoAtts = attachments.filter(
    (a) => a.url && a.mimeType?.startsWith("video/"),
  );
  const imageAtts = attachments.filter(
    (a) => a.url && a.mimeType?.startsWith("image/"),
  );
  const audioAtts = attachments.filter(
    (a) => a.url && a.mimeType?.startsWith("audio/"),
  );
  // Pair narration audio (filename starts with `narration_`) with its video by stem
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
                  <span className="text-muted-foreground">
                    {formatBytes(a.sizeBytes)}
                  </span>
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
          <SendPlanButton content={content} />
        </div>
      </div>
    </div>
  );
}

function SendPlanButton({ content }: { content: string }) {
  const filePlan = useServerFn(filePlanFromChat);
  const [busy, setBusy] = useState(false);
  // Heuristic: show only when content looks like an outbound/publishing plan.
  const looksLikePlan = /\b(linkedin|outbound|post\s*\d|publishing plan|email\s+sequence|reminder)\b/i.test(content) && content.length > 200;
  if (!looksLikePlan) return null;

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Filing plan to Outbound…");
    try {
      const res: any = await filePlan({ data: { plan: content } });
      const count = res?.filed?.length ?? 0;
      const errCount = res?.errors?.length ?? 0;
      toast.dismiss(t);
      if (count > 0) {
        toast.success(`${count} draft${count === 1 ? "" : "s"} filed to Outbound${errCount ? ` (${errCount} skipped)` : ""}`, {
          action: {
            label: "Review",
            onClick: () => { window.location.href = "/outbound"; },
          },
        });
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
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <SendIcon className="h-3 w-3" />}
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


