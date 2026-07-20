import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { CHAT_MODEL_OPTIONS, type ChatModelOption } from "@/lib/chat-models";
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Menu, Square, Upload } from "lucide-react";
import { VdnxLoader } from "@/components/VdnxLoader";

import {
  readFileAsBase64,
  MODEL_STORAGE_KEY,
  ACTIVE_CONVO_KEY,
  type Attachment,
  type Msg,
  type Conversation,
} from "@/lib/chat-helpers";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { MessageRow } from "@/components/chat/MessageRow";
import { SwarmPopover } from "@/components/chat/SwarmPopover";
import { runSwarm, getSwarmRunsForConversation } from "@/serverfns/swarm.functions";

export function ChatWorkspace({ initialSessionId = null }: { initialSessionId?: string | null }) {
  const navigate = useNavigate();
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

  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (initialSessionId) return initialSessionId;
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_CONVO_KEY);
  });

  // Reflect URL param → state when it changes (e.g. tab restore, back/forward)
  useEffect(() => {
    if (initialSessionId && initialSessionId !== activeId) {
      setActiveIdState(initialSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  // Wrapper: setting activeId also navigates to per-session URL so tabs are shareable.
  const setActiveId = (id: string | null) => {
    setActiveIdState(id);
    if (id && id !== initialSessionId) {
      navigate({ to: "/chat/$sessionId", params: { sessionId: id } });
    } else if (!id) {
      navigate({ to: "/chat" });
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const { data: libraryModels = [] } = useQuery({
    queryKey: ["chat", "base-models"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("base_models")
        .select("slug,name,provider,description")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        slug: string;
        name: string;
        provider?: string | null;
        description?: string | null;
      }>;
    },
  });
  // Per-user scope: show every model the user enabled in Settings → Models.
  // No hard cap — user-added model-library rows become pickable here.
  const modelOptions = useMemo(() => {
    const byId = new Map<string, ChatModelOption>(
      CHAT_MODEL_OPTIONS.map((m) => [m.id, { ...m }]),
    );
    for (const m of libraryModels) {
      const slug = m.slug?.trim();
      if (!slug || [...byId.values()].some((existing) => existing.slug === slug)) continue;
      byId.set(slug, {
        id: slug,
        slug,
        label: m.name?.trim() || slug,
        provider: m.provider ?? "openrouter",
        description: m.description ?? undefined,
        source: "library" as const,
      });
    }
    for (const m of allowlist?.options ?? []) {
      if (!byId.has(m.id)) byId.set(m.id, m);
    }
    return Array.from(byId.values());
  }, [allowlist?.options, libraryModels]);
  const allowedModels = useMemo(() => {
    const allowed = new Set(
      !allowlist || allowlist.isDefault
        ? modelOptions.map((m) => m.id)
        : allowlist.allowed,
    );
    return modelOptions.filter((m) => allowed.has(m.id));
  }, [allowlist, modelOptions]);

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
      modelOptions.find((m) => m.id === model)?.label ??
      CHAT_MODEL_OPTIONS[0].label,
    [model, modelOptions],
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
      <ConversationSidebar
        isOwner={isOwner}
        conversations={conversations}
        activeId={activeId}
        setActiveId={setActiveId}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onNew={() => newConvoMutation.mutate()}
        newPending={newConvoMutation.isPending}
        onRename={handleRename}
        onDelete={handleDelete}
      />

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

            {messages.map((m, idx) => {
              let linkedInAuthoring = false;
              if (m.role === "assistant") {
                for (let i = idx - 1; i >= 0; i--) {
                  const prev = messages[i];
                  if (prev.role !== "user") continue;
                  const c = prev.content.toLowerCase();
                  const mentionsPost = /\b(linkedin|post|posts)\b/.test(c);
                  const authoringVerb = /\b(write|draft|create|compose|generate|make|give me|give us|come up with|brainstorm|another|more|need|want|fresh|new)\b/.test(c);
                  const numericPostAsk = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(more\s+)?(linkedin\s+)?(posts?|variants?|drafts?|options?|versions?|ideas?)\b/i.test(prev.content);
                  linkedInAuthoring = (mentionsPost && authoringVerb) || numericPostAsk;
                  break;
                }
              }
              return (
                <MessageRow
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  attachments={m.attachments ?? []}
                  artifact={m.artifact_json ?? parseArtifactFromMarkdown(m.content)}
                  modelUsed={(m as any).model_used ?? null}
                  onOpenArtifact={setOpenArtifact}
                  linkedInAuthoring={linkedInAuthoring}
                />
              );
            })}


            {pendingUser && (
              <MessageRow
                role="user"
                content={pendingUser.content}
                attachments={pendingUser.attachments}
              />
            )}

            {showThinking && (
              <div className="pl-1"><VdnxLoader size="sm" label="CEO THINKING" /></div>
            )}

            {showGenerating && (
              <div className="pl-1"><VdnxLoader size="sm" label="GENERATING" /></div>
            )}
          </div>
        </div>

        <ChatComposer
          input={input}
          setInput={setInput}
          attachments={attachments}
          setAttachments={setAttachments}
          uploading={uploading}
          pending={mutation.isPending || docMutation.isPending}
          canSend={canSend}
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          onSubmit={() => handleSubmit()}
          onStop={handleStop}
          onFiles={handleFiles}
          onGenerateDoc={handleGenerateDoc}
        />
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



