// Client-side SSE consumer for /api/public/chat-stream.
// Falls back gracefully: caller should catch and use the legacy sendCeoMessage
// path on any error (including HTTP 409 "route via legacy path").
import { supabase } from "@/integrations/supabase/client";

export type ChatStreamStartEvent = {
  conversation_id: string;
  model: string;
};

export type ChatStreamFinalMessage = {
  id: string;
  role: "assistant";
  content: string;
  created_at: string;
  conversation_id: string;
  model_used: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
};

export type StreamChatOpts = {
  content: string;
  conversationId?: string | null;
  model?: string;
  signal?: AbortSignal;
  onStart?: (info: ChatStreamStartEvent) => void;
  onToken?: (delta: string) => void;
};

// Thrown when the server declined the stream path (e.g. slash command)
// and the caller should invoke the legacy send fn instead.
export class ChatStreamFallback extends Error {
  constructor(message = "Use legacy chat path") {
    super(message);
    this.name = "ChatStreamFallback";
  }
}

export async function streamChat(
  opts: StreamChatOpts,
): Promise<ChatStreamFinalMessage> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/public/chat-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      content: opts.content,
      conversationId: opts.conversationId ?? null,
      model: opts.model,
    }),
    signal: opts.signal,
  });

  if (res.status === 409) throw new ChatStreamFallback();
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Chat stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: ChatStreamFinalMessage | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = frame.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const ln of lines) {
        if (ln.startsWith("event:")) event = ln.slice(6).trim();
        else if (ln.startsWith("data:")) dataLines.push(ln.slice(5).trim());
      }
      if (!dataLines.length) continue;
      let payload: any;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }
      switch (event) {
        case "start":
          opts.onStart?.(payload);
          break;
        case "token":
          if (typeof payload?.delta === "string") opts.onToken?.(payload.delta);
          break;
        case "message":
          finalMessage = payload;
          break;
        case "error":
          errorMessage = payload?.message ?? "Chat stream error";
          break;
        case "done":
          break;
      }
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!finalMessage) throw new Error("Chat stream closed without final message");
  return finalMessage;
}

// Client-side guard mirroring the server's SLASH_RE / MENTION_RE. When this
// returns false, do NOT attempt to stream — call the legacy sendCeoMessage
// path directly. Kept in sync with the regexes in chat-stream.ts.
const SLASH_RE = /^\/(pdf|docx|search|fetch|video|repo)\b/i;
const MENTION_RE = /^@[a-z]+\s+/i;

export function isStreamEligible(opts: {
  content: string;
  attachmentCount: number;
  model: string;
  swarm: boolean;
}): boolean {
  if (opts.swarm) return false;
  if (opts.attachmentCount > 0) return false;
  if (opts.model === "kling") return false;
  const trimmed = opts.content.trim();
  if (!trimmed) return false;
  if (SLASH_RE.test(trimmed)) return false;
  if (MENTION_RE.test(trimmed)) return false;
  return true;
}
