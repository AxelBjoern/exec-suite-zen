import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getCeoChat, sendCeoMessage, clearCeoChat } from "@/serverfns/ceo-chat.functions";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — VDNX CEO Agent" },
      { name: "description", content: "Direct conversational chat with the VDNX CEO agent." },
    ],
  }),
  component: ChatPage,
});

type Msg = { id: string; role: "user" | "assistant"; content: string; created_at: string };

function ChatPage() {
  const load = useServerFn(getCeoChat);
  const send = useServerFn(sendCeoMessage);
  const clear = useServerFn(clearCeoChat);
  const qc = useQueryClient();

  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["ceo-chat"],
    queryFn: () => load() as Promise<Msg[]>,
  });

  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation({
    mutationFn: async (content: string) => send({ data: { content } }),
    onMutate: (content) => setPendingUser(content),
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingUser, mutation.isPending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || mutation.isPending) return;
    setInput("");
    mutation.mutate(text);
  }

  const showThinking = mutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between bg-card/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">VDNX</div>
            <h1 className="text-lg font-semibold tracking-tight">CEO Agent — Direct Chat</h1>
          </div>
        </div>
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
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-3xl mx-auto py-8 space-y-8">
          {messages.length === 0 && !pendingUser && (
            <div className="text-center py-20 text-muted-foreground">
              <div className="text-sm uppercase tracking-[0.2em] mb-3">Start the conversation</div>
              <p className="text-base">
                Ask the CEO agent anything — strategy, decisions, delegation, opinions.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageRow key={m.id} role={m.role} content={m.content} />
          ))}

          {pendingUser && <MessageRow role="user" content={pendingUser} />}

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
              placeholder="Message the CEO…  (Enter to send, Shift+Enter for newline)"
              rows={2}
              disabled={mutation.isPending}
              className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || mutation.isPending}
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

function MessageRow({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
          {content}
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
