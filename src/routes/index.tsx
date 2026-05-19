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
} from "@/serverfns/ceo-chat.functions";
import { CHAT_MODEL_OPTIONS } from "@/lib/chat-models";
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
import {
  ArrowLeft,
  Send,
  Trash2,
  Loader2,
  Paperclip,
  X,
  FileText,
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
};

const MODEL_STORAGE_KEY = "ceo-chat-model";
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

function ChatPage() {
  const load = useServerFn(getCeoChat);
  const send = useServerFn(sendCeoMessage);
  const clear = useServerFn(clearCeoChat);
  const upload = useServerFn(uploadCeoAttachment);
  const qc = useQueryClient();

  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["ceo-chat"],
    queryFn: () => load() as Promise<Msg[]>,
  });

  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState<{
    content: string;
    attachments: Attachment[];
  } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [model, setModel] = useState<string>(() => {
    if (typeof window === "undefined") return CHAT_MODEL_OPTIONS[0].id;
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? CHAT_MODEL_OPTIONS[0].id;
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(MODEL_STORAGE_KEY, model);
    }
  }, [model]);

  const mutation = useMutation({
    mutationFn: async (vars: { content: string; attachmentIds: string[] }) =>
      send({
        data: {
          content: vars.content,
          model,
          attachmentIds: vars.attachmentIds,
        },
      }),
    onMutate: (vars) => {
      setPendingUser({ content: vars.content, attachments: [...attachments] });
      setAttachments([]);
    },
    onSettled: async () => {
      setPendingUser(null);
      await qc.invalidateQueries({ queryKey: ["ceo-chat"] });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (e: any) => toast.error(e?.message ?? "Send failed"),
  });

  const clearMutation = useMutation({
    mutationFn: async () => clear(),
    onSuccess: () => {
      qc.setQueryData(["ceo-chat"], []);
      toast.success("Conversation cleared");
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pendingUser, mutation.isPending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    if (mutation.isPending || uploading) return;
    if (!text && attachments.length === 0) return;
    setInput("");
    mutation.mutate({
      content: text,
      attachmentIds: attachments.map((a) => a.id),
    });
  }

  const activeModelLabel = useMemo(
    () =>
      CHAT_MODEL_OPTIONS.find((m) => m.id === model)?.label ??
      CHAT_MODEL_OPTIONS[0].label,
    [model],
  );

  const showThinking = mutation.isPending;
  const canSend =
    (input.trim().length > 0 || attachments.length > 0) &&
    !mutation.isPending &&
    !uploading;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between bg-card/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/terminal"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              VDNX
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              CEO Agent — Direct Chat
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue>{activeModelLabel}</SelectValue>
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
            disabled={clearMutation.isPending || messages.length === 0}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Clear
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
                opinions. Attach docs with the paperclip below.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageRow
              key={m.id}
              role={m.role}
              content={m.content}
              attachments={m.attachments ?? []}
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
              placeholder="Message the CEO…  Try @cfo, @cmo, @cto, @sales, @board…  (Enter to send, Shift+Enter for newline)"
              rows={2}
              disabled={mutation.isPending}
              className="w-full resize-none bg-transparent pl-12 pr-14 py-3 text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || mutation.isPending}
              className="absolute left-2 bottom-2 h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Attach document"
              title="Attach .pdf, .docx, .txt, .md"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              className="absolute right-2 bottom-2 h-9 w-9"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

function MessageRow({
  role,
  content,
  attachments,
}: {
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
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
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary tracking-wider">
        CEO
      </div>
      <div className="flex-1 min-w-0 prose prose-sm prose-invert max-w-none prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-primary prose-strong:text-foreground">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
