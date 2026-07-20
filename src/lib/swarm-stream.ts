// Client-side SSE consumer for /api/public/swarm-stream.
// Parses text/event-stream, invokes callbacks per event, and resolves to
// the final assistant message payload.
import { supabase } from "@/integrations/supabase/client";

export type SwarmStreamDrafter = {
  model: string;
  label: string;
  role: string | null;
  role_label: string | null;
};

export type SwarmStreamRunEvent = {
  conversation_id: string;
  synth_model: string;
  synth_label: string;
  drafters: SwarmStreamDrafter[];
};

export type SwarmStreamDraftEvent = {
  index: number;
  model: string;
  label: string;
  role: string | null;
  role_label: string | null;
  status: "ok" | "error";
  content: string;
  error: string | null;
  latency_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
};

export type SwarmStreamBreakdownItem = {
  model: string;
  label: string;
  role: string | null;
  role_label: string | null;
  confidence: number | null;
  rationale: string | null;
};

export type StreamSwarmOpts = {
  content: string;
  conversationId?: string | null;
  attachmentIds?: string[];
  signal?: AbortSignal;
  onRun?: (info: SwarmStreamRunEvent) => void;
  onDraft?: (d: SwarmStreamDraftEvent) => void;
  onSynthStart?: (info: { synth_model: string; synth_label: string; ok_count: number }) => void;
  onBreakdown?: (items: SwarmStreamBreakdownItem[]) => void;
};

export async function streamSwarm(opts: StreamSwarmOpts): Promise<any> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/public/swarm-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      content: opts.content,
      conversationId: opts.conversationId ?? null,
      attachmentIds: opts.attachmentIds ?? [],
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Swarm stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: any = null;
  let errorMessage: string | null = null;

  // Parse SSE frames: separated by "\n\n". Each frame has one or more
  // "event: X" / "data: Y" lines.
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
      if (dataLines.length === 0) continue;
      let payload: any;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }
      switch (event) {
        case "run":
          opts.onRun?.(payload);
          break;
        case "draft":
          opts.onDraft?.(payload);
          break;
        case "synth_start":
          opts.onSynthStart?.(payload);
          break;
        case "message":
          finalMessage = payload;
          break;
        case "error":
          errorMessage = payload?.message ?? "Swarm error";
          break;
        case "done":
          break;
      }
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!finalMessage) throw new Error("Swarm stream closed without final message");
  return finalMessage;
}
