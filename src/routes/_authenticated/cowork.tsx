import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Send, Trash2, ArrowLeft, MessagesSquare, Sparkles, Square } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PreviewPane, type PreviewType } from "@/components/PreviewPane";
import {
  listSessions, getSession, createSession, updateSession, applyPreview, deleteSession, vibeChat,
} from "@/lib/cowork.functions";

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "grok", label: "Grok 4.3" },
  { value: "hermes", label: "Hermes 4 405B" },
  { value: "gpt", label: "ChatGPT 5.3" },
  { value: "claude", label: "Claude Opus 4.7" },
  { value: "deepseek", label: "DeepSeek V4 Pro" },
  { value: "deepseek-flash", label: "DeepSeek V4 Flash" },
  { value: "nemotron", label: "Nemotron 3 Nano Omni 30B" },
];

const FENCE = /```(\w+)?\n([\s\S]*?)```/g;
const PREVIEWABLE = new Set(["markdown", "md", "tsx", "ts", "json", "mermaid"]);

function lastFencedBlock(text: string): { lang: string; code: string } | null {
  let m: RegExpExecArray | null;
  let last: { lang: string; code: string } | null = null;
  while ((m = FENCE.exec(text)) !== null) {
    const lang = (m[1] ?? "").toLowerCase();
    if (PREVIEWABLE.has(lang)) last = { lang: lang === "md" ? "markdown" : lang, code: m[2] };
  }
  return last;
}

type Msg = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/_authenticated/cowork")({
  validateSearch: (s) => z.object({ session: z.string().uuid().optional() }).parse(s),
  head: () => ({ meta: [{ title: "Cowork — Vibe Coder Workspace" }, { name: "description", content: "Live AI cowork session with markdown, code, JSON, and Mermaid preview." }] }),
  component: CoworkPage,
});

function CoworkPage() {
  const { session } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const listFn = useServerFn(listSessions);
  const getFn = useServerFn(getSession);
  const createFn = useServerFn(createSession);
  const updateFn = useServerFn(updateSession);
  const applyFn = useServerFn(applyPreview);
  const deleteFn = useServerFn(deleteSession);
  const chatFn = useServerFn(vibeChat);

  const sessions = useQuery({ queryKey: ["cowork-sessions"], queryFn: () => listFn(), staleTime: 60_000 });
  const current = useQuery({
    queryKey: ["cowork-session", session],
    queryFn: () => session ? getFn({ data: { id: session } }) : null,
    enabled: !!session,
  });

  const [input, setInput] = useState("");
  const [pendingMsg, setPendingMsg] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const messages: Msg[] = (current.data?.messages as Msg[] | undefined) ?? [];
  const previewContent: string = current.data?.preview_content ?? "";
  const previewType: PreviewType = (current.data?.preview_type as PreviewType) ?? "markdown";
  const appliedContent: string | null = current.data?.applied_content ?? null;

  useEffect(() => { taRef.current?.focus(); }, [session]);

  const newSession = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["cowork-sessions"] });
      navigate({ search: { session: row.id } });
    },
  });

  const update = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id: session!, ...patch } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cowork-session", session] }); qc.invalidateQueries({ queryKey: ["cowork-sessions"] }); },
  });

  const apply = useMutation({
    mutationFn: () => applyFn({ data: { id: session! } }),
    onSuccess: () => { toast.success("Applied — snapshot saved"); qc.invalidateQueries({ queryKey: ["cowork-session", session] }); },
    onError: (e: any) => toast.error(e?.message ?? "Apply failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cowork-sessions"] }); navigate({ search: {} }); },
  });

  async function send() {
    if (!input.trim()) return;
    let sid = session;
    if (!sid) {
      const row: any = await createFn({ data: {} });
      sid = row.id;
      navigate({ search: { session: sid } });
    }
    const next: Msg[] = [...messages, { role: "user", content: input.trim() }];
    setInput("");
    setPendingMsg(true);
    try {
      await updateFn({ data: { id: sid!, messages: next } });
      qc.invalidateQueries({ queryKey: ["cowork-session", sid] });
      const res = await chatFn({ data: { messages: next } });
      const reply = (res as any).text ?? "";
      const final: Msg[] = [...next, { role: "assistant", content: reply }];
      const block = lastFencedBlock(reply);
      const patch: any = { messages: final };
      if (block) { patch.preview_content = block.code; patch.preview_type = block.lang; }
      else if (!previewContent) { patch.preview_content = reply; patch.preview_type = "markdown"; }
      await updateFn({ data: { id: sid!, ...patch } });
      qc.invalidateQueries({ queryKey: ["cowork-session", sid] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chat failed");
    } finally {
      setPendingMsg(false);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }

  async function regenerate() {
    if (!messages.length) return;
    const trimmed = messages[messages.length - 1].role === "assistant" ? messages.slice(0, -1) : messages;
    setPendingMsg(true);
    try {
      const res = await chatFn({ data: { messages: trimmed } });
      const reply = (res as any).text ?? "";
      const final: Msg[] = [...trimmed, { role: "assistant", content: reply }];
      const block = lastFencedBlock(reply);
      const patch: any = { messages: final };
      if (block) { patch.preview_content = block.code; patch.preview_type = block.lang; }
      await updateFn({ data: { id: session!, ...patch } });
      qc.invalidateQueries({ queryKey: ["cowork-session", session] });
    } finally { setPendingMsg(false); }
  }

  return (
    <div className="flex h-[calc(100vh-3.25rem)] bg-background">
      <aside className="w-64 shrink-0 border-r border-border bg-panel flex flex-col">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cowork</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => newSession.mutate()} disabled={newSession.isPending} className="mx-2 mt-2 justify-start text-xs">
          <Plus className="h-3 w-3 mr-1" /> New session
        </Button>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.data?.rows.map((s: any) => (
            <div key={s.id} className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-panel-2 ${session === s.id ? "bg-panel-2 border border-border" : ""}`}>
              <button onClick={() => navigate({ search: { session: s.id } })} className="flex-1 text-left truncate text-foreground">{s.title}</button>
              <button onClick={() => del.mutate(s.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {sessions.data?.rows.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">No sessions yet.</p>}
        </div>
      </aside>

      <section className="flex-1 flex min-w-0 border-r border-border">
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!session && (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                <div><MessagesSquare className="mx-auto h-6 w-6 mb-2" /><p>Start a new session or pick one from the left.</p></div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={m.role === "user" ? "max-w-[80%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm" : "max-w-[80%] text-sm text-foreground whitespace-pre-wrap"}>{m.content}</div>
              </div>
            ))}
            {pendingMsg && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Vibe Coder is thinking…</div>}
          </div>
          <div className="border-t border-border p-3">
            <div className="relative">
              <textarea
                ref={taRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask for a brief, a workflow JSON, a diagram, or some code…"
                disabled={pendingMsg}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm outline-none focus:border-primary/60"
                rows={3}
              />
              <Button size="icon" onClick={send} disabled={pendingMsg || !input.trim()} className="absolute right-2 bottom-2 h-7 w-7"><Send className="h-3 w-3" /></Button>
            </div>
          </div>
        </div>
      </section>

      <section className="w-[46%] min-w-[420px] flex flex-col">
        <PreviewPane
          content={previewContent} type={previewType}
          originalContent={appliedContent ?? undefined}
          onApply={session ? () => apply.mutate() : undefined}
          onRegenerate={session && messages.length ? regenerate : undefined}
          onChange={(v) => update.mutate({ preview_content: v })}
          applying={apply.isPending} regenerating={pendingMsg}
        />
      </section>
    </div>
  );
}
