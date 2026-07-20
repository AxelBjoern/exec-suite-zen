// SSE token-streaming route for plain conversational chat (Slice 1).
//
// Safety contract:
// - This route ONLY handles pure conversational messages. It refuses (409)
//   any prompt containing slash commands (/pdf, /docx, /search, /fetch,
//   /video, /repo), @mention dispatch, attachments, or model=kling — the
//   client falls back to the existing `sendCeoMessage` server fn for those.
// - The final persisted `ceo_chat_messages` row shape is IDENTICAL to what
//   `sendCeoMessage` writes (role/content/conversation_id/user_id), plus
//   the new nullable metric columns (model_used, latency_ms, tokens_in,
//   tokens_out) — no schema change to existing behavior.
// - No changes to swarm, slash-command, repo grounding, or dispatch paths.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveTextChatModel } from "@/server/llm.server";

async function resolveUserFromAuth(request: Request) {
  const auth =
    request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data } = await supabaseAdmin.auth.getUser(token);
  return data?.user ?? null;
}

type Body = {
  content?: string;
  conversationId?: string | null;
  model?: string;
};

// Anything the streaming route intentionally can't handle. The client checks
// the same regex before attempting the stream; kept here as the server-side
// guarantee.
const SLASH_RE = /^\/(pdf|docx|search|fetch|video|repo)\b/i;
const MENTION_RE = /^@[a-z]+\s+/i;

// Minimal system prompt for streaming path. Mirrors the conversational tone
// of buildCeoSystem() but omits the slash-command / dispatch / repo-tool
// instructions since this route intentionally doesn't handle those.
const SYSTEM_PROMPT = `You are a decisive, founder-grade CEO Agent in conversational chat mode.

Rules:
- Direct, sharp, active voice. No filler.
- Markdown welcome (headings, bullets, tables) but keep replies tight unless asked for depth.
- Never invent metrics or commitments. If you don't know, say so and propose how to find out.
- Conversational: do NOT emit JSON or "Artifact" sections unless the operator explicitly asks for a deliverable.`;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MAX_TOKENS = 8000;

export const Route = createFileRoute("/api/public/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await resolveUserFromAuth(request);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const content = (body.content ?? "").trim();
        if (!content) return new Response("Empty prompt", { status: 400 });
        if (content.length > 8000) return new Response("Prompt too long", { status: 400 });

        // Refuse anything the legacy path handles — client falls back.
        if (SLASH_RE.test(content) || MENTION_RE.test(content)) {
          return new Response("Route via legacy path", { status: 409 });
        }
        if (body.model === "kling") {
          return new Response("Video model not streamed", { status: 409 });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) return new Response("OPENROUTER_API_KEY missing", { status: 500 });

        let modelSlug: string;
        try {
          modelSlug = resolveTextChatModel(body.model);
        } catch (e: any) {
          return new Response(e?.message ?? "Unknown model", { status: 400 });
        }

        const userId = user.id;
        const admin = supabaseAdmin as any;

        // Ensure conversation
        let convId = body.conversationId ?? null;
        if (!convId) {
          const title = content.slice(0, 80);
          const { data: conv, error: cErr } = await admin
            .from("ceo_conversations")
            .insert({ user_id: userId, title })
            .select("id")
            .single();
          if (cErr) return new Response(cErr.message, { status: 500 });
          convId = conv.id as string;
        }

        // Persist user message
        const { error: uErr } = await admin
          .from("ceo_chat_messages")
          .insert({
            user_id: userId,
            conversation_id: convId,
            role: "user",
            content,
          });
        if (uErr) return new Response(uErr.message, { status: 500 });

        // Load short history (same window as legacy path)
        const { data: history } = await admin
          .from("ceo_chat_messages")
          .select("role, content")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(80);

        const messages = [
          { role: "system", content: SYSTEM_PROMPT },
          ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
        ];

        const started = Date.now();
        const upstream = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://lovable.app",
            "X-Title": "VDNX Agents",
          },
          body: JSON.stringify({
            model: modelSlug,
            messages,
            max_tokens: DEFAULT_MAX_TOKENS,
            stream: true,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const txt = await upstream.text().catch(() => "");
          return new Response(
            `Upstream ${upstream.status}: ${txt.slice(0, 300)}`,
            { status: 502 },
          );
        }

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (event: string, data: unknown) => {
              controller.enqueue(
                enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            };

            let assembled = "";
            let tokensIn: number | null = null;
            let tokensOut: number | null = null;
            const reader = upstream.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            send("start", {
              conversation_id: convId,
              model: modelSlug,
            });

            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let sep: number;
                while ((sep = buf.indexOf("\n")) !== -1) {
                  const line = buf.slice(0, sep).trim();
                  buf = buf.slice(sep + 1);
                  if (!line || !line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (payload === "[DONE]") continue;
                  try {
                    const j = JSON.parse(payload);
                    const delta = j?.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta.length) {
                      assembled += delta;
                      send("token", { delta });
                    }
                    if (j?.usage) {
                      tokensIn = j.usage.prompt_tokens ?? tokensIn;
                      tokensOut = j.usage.completion_tokens ?? tokensOut;
                    }
                  } catch {
                    /* skip malformed line */
                  }
                }
              }

              const latency = Date.now() - started;
              const finalContent = assembled.trim();
              if (!finalContent) {
                send("error", { message: "Empty response from model" });
                controller.close();
                return;
              }

              const { data: saved, error: sErr } = await admin
                .from("ceo_chat_messages")
                .insert({
                  user_id: userId,
                  conversation_id: convId,
                  role: "assistant",
                  content: finalContent,
                  model_used: modelSlug,
                  latency_ms: latency,
                  tokens_in: tokensIn,
                  tokens_out: tokensOut,
                })
                .select("id, role, content, created_at, conversation_id, model_used, latency_ms, tokens_in, tokens_out")
                .single();
              if (sErr) {
                send("error", { message: sErr.message });
                controller.close();
                return;
              }

              await admin
                .from("ceo_conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", convId);

              send("message", saved);
              send("done", { ok: true });
            } catch (err: any) {
              send("error", { message: err?.message ?? String(err) });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
