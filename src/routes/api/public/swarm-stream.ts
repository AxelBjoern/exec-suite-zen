// Public (auth-bypassed at edge) SSE swarm streaming route.
// Runs the same swarm pipeline as runSwarm but emits SSE events as each
// draft finishes, then a synth_start event, then the final assistant
// message. Persists the run + drafts + messages identically to runSwarm.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, resolveTextChatModel } from "@/server/llm.server";
import {
  SYNTH_SYSTEM,
  draftOne,
  type DraftResult,
} from "@/server/swarm-core.server";
import {
  DEFAULT_AGENT_FALLBACK,
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_MAX_PARALLEL,
  DEFAULT_SWARM_MODELS,
  DEFAULT_SYNTH_MODEL,
  labelForModel,
  loadAvailableSwarmModels,
  normalizeAgents,
  normalizeModels,
  type SwarmRole,
} from "@/serverfns/swarm.functions";

async function resolveUserFromAuth(request: Request) {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data } = await supabaseAdmin.auth.getUser(token);
  return data?.user ?? null;
}

type Body = {
  content?: string;
  conversationId?: string | null;
  models?: string[];
  synthModel?: string;
  agents?: any[] | null;
  useAgents?: boolean;
};

export const Route = createFileRoute("/api/public/swarm-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await resolveUserFromAuth(request);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const content = (body.content ?? "").trim();
        if (!content) return new Response("Empty prompt", { status: 400 });
        if (content.length > 8000) return new Response("Prompt too long", { status: 400 });

        const userId = user.id;
        const admin = supabaseAdmin as any;

        // Load user config
        const { data: cfg } = await admin
          .from("user_settings")
          .select("swarm_models,swarm_synth_model,swarm_max_parallel,swarm_agents")
          .eq("user_id", userId)
          .maybeSingle();

        const cap = Math.min(6, Math.max(2, cfg?.swarm_max_parallel ?? DEFAULT_MAX_PARALLEL));
        const rawModels = body.models?.length ? body.models : (cfg?.swarm_models ?? DEFAULT_SWARM_MODELS);
        const rawSynth = body.synthModel || cfg?.swarm_synth_model || DEFAULT_SYNTH_MODEL;
        const rawAgents = normalizeAgents(body.agents ?? cfg?.swarm_agents);
        const keep = Array.from(new Set([...rawModels, rawSynth, ...rawAgents.map((a) => a.model)]));
        const available = await loadAvailableSwarmModels(admin, keep, { userId, userEmail: user.email });
        const allowed = new Set(available.map((m) => m.slug));
        const synthModel = allowed.has(rawSynth) ? rawSynth : (available[0]?.slug ?? DEFAULT_SYNTH_MODEL);
        const synthLabel = labelForModel(synthModel, available);

        const agentsResolved = normalizeAgents(body.agents ?? cfg?.swarm_agents, allowed);
        const activeAgents = agentsResolved
          .filter((a) => a.enabled && allowed.has(a.model))
          .slice(0, cap);

        type FanUnit = {
          model: string;
          systemPrompt: string;
          role: SwarmRole | null;
          roleLabel: string | null;
          label: string;
          fallbackModel: string | null;
          timeoutMs: number;
        };
        const pickFallback = (primary: string, wanted?: string | null): string | null => {
          if (wanted && wanted !== primary && allowed.has(wanted)) return wanted;
          if (allowed.has(DEFAULT_AGENT_FALLBACK) && DEFAULT_AGENT_FALLBACK !== primary) return DEFAULT_AGENT_FALLBACK;
          const alt = available.find((m) => m.slug !== primary);
          return alt?.slug ?? null;
        };
        let units: FanUnit[];
        const useAgents = body.useAgents !== false;
        if (useAgents && activeAgents.length >= 2) {
          units = activeAgents.map((a) => ({
            model: a.model,
            systemPrompt: a.systemPrompt,
            role: a.role,
            roleLabel: a.label,
            label: labelForModel(a.model, available),
            fallbackModel: pickFallback(a.model, a.fallbackModel),
            timeoutMs: a.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
          }));
        } else {
          const models = normalizeModels(rawModels, cap, allowed);
          if (models.length < 2) {
            return new Response("Swarm requires at least 2 models. Configure in the Swarm menu.", { status: 400 });
          }
          const drafterSystem =
            "You are a top-tier assistant. Give the best answer you can to the user's message. Be specific, correct, and useful. Prefer markdown structure when helpful.";
          units = models.map((m) => ({
            model: m,
            systemPrompt: drafterSystem,
            role: null,
            roleLabel: null,
            label: labelForModel(m, available),
            fallbackModel: pickFallback(m, null),
            timeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
          }));
        }

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

        // Save user message
        await admin.from("ceo_chat_messages").insert({
          user_id: userId,
          conversation_id: convId,
          role: "user",
          content,
        });

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (event: string, data: unknown) => {
              controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
              send("run", {
                conversation_id: convId,
                synth_model: synthModel,
                synth_label: synthLabel,
                drafters: units.map((u) => ({
                  model: u.model,
                  label: u.label,
                  role: u.role,
                  role_label: u.roleLabel,
                })),
              });

              const runStarted = Date.now();
              const drafts: DraftResult[] = new Array(units.length);

              // Fan out; emit each as it finishes
              await Promise.all(
                units.map(async (u, i) => {
                  const r = await draftOne(u.model, content, u.systemPrompt);
                  const draft: DraftResult = { ...r, label: u.label, role: u.role, roleLabel: u.roleLabel };
                  drafts[i] = draft;
                  send("draft", {
                    index: i,
                    model: draft.model,
                    label: draft.label,
                    role: draft.role,
                    role_label: draft.roleLabel,
                    status: draft.status,
                    content: draft.content,
                    error: draft.error ?? null,
                    latency_ms: draft.latency_ms,
                    tokens_in: draft.tokens_in ?? null,
                    tokens_out: draft.tokens_out ?? null,
                  });
                }),
              );

              const okDrafts = drafts.filter((d) => d.status === "ok");
              const models = units.map((u) => u.model);
              let finalContent = "";
              let swarmStatus: "ok" | "degraded" | "failed" = "ok";

              send("synth_start", { synth_model: synthModel, synth_label: synthLabel, ok_count: okDrafts.length });

              if (okDrafts.length === 0) {
                finalContent =
                  `_Swarm failed — all ${drafts.length} models errored._\n\n` +
                  drafts.map((d) => `- **${d.label}**: ${d.error}`).join("\n");
                swarmStatus = "failed";
              } else {
                if (okDrafts.length < drafts.length) swarmStatus = "degraded";
                const draftBlock = okDrafts
                  .map((d, i) => {
                    const header = d.roleLabel ? `${d.roleLabel} · ${d.label}` : d.label;
                    return `## Draft ${String.fromCharCode(65 + i)} (${header})\n\n${d.content}`;
                  })
                  .join("\n\n---\n\n");
                try {
                  const synthJson = await chatCompletion({
                    model: resolveTextChatModel(synthModel),
                    temperature: 0.3,
                    messages: [
                      { role: "system", content: SYNTH_SYSTEM },
                      {
                        role: "user",
                        content: `USER PROMPT:\n${content}\n\n---\n\n${okDrafts.length} INDEPENDENT DRAFTS:\n\n${draftBlock}\n\n---\n\nProduce the final, unified answer now.`,
                      },
                    ],
                  });
                  finalContent =
                    synthJson?.choices?.[0]?.message?.content?.trim() || okDrafts[0].content;
                } catch (e: any) {
                  finalContent =
                    okDrafts[0].content +
                    `\n\n---\n_(Synthesizer ${synthLabel} failed: ${e?.message ?? "error"} — showing strongest draft.)_`;
                  swarmStatus = "degraded";
                }
              }

              // Persist assistant message
              const { data: savedMsg, error: mErr } = await admin
                .from("ceo_chat_messages")
                .insert({
                  user_id: userId,
                  conversation_id: convId,
                  role: "assistant",
                  content: finalContent,
                })
                .select("id, role, content, created_at, conversation_id")
                .single();
              if (mErr) throw new Error(mErr.message);

              // Persist run + drafts
              const { data: runRow } = await admin
                .from("swarm_runs")
                .insert({
                  user_id: userId,
                  conversation_id: convId,
                  message_id: savedMsg.id,
                  synth_model: synthModel,
                  drafter_models: models,
                  status: swarmStatus,
                  latency_ms: Date.now() - runStarted,
                })
                .select("id")
                .single();
              if (runRow) {
                await admin.from("swarm_drafts").insert(
                  drafts.map((d) => ({
                    run_id: runRow.id,
                    user_id: userId,
                    model_slug: d.model,
                    model_label: d.label,
                    role: d.role ?? null,
                    role_label: d.roleLabel ?? null,
                    content: d.content,
                    status: d.status,
                    error: d.error ?? null,
                    latency_ms: d.latency_ms,
                    tokens_in: d.tokens_in ?? null,
                    tokens_out: d.tokens_out ?? null,
                  })),
                );
              }

              await admin
                .from("ceo_conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", convId);

              send("message", {
                ...savedMsg,
                swarm_run_id: runRow?.id ?? null,
                swarm_synth_model: synthModel,
                swarm_synth_label: synthLabel,
                swarm_status: swarmStatus,
                swarm_drafter_count: models.length,
              });
              send("done", { ok: true });
            } catch (err: any) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: error\ndata: ${JSON.stringify({ message: err?.message ?? String(err) })}\n\n`,
                ),
              );
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
