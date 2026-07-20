// Server-only swarm primitives. Kept out of `swarm.functions.ts` because
// that file is reachable from the client bundle (routes import server-fn
// wrappers from it), and the import-protection plugin blocks any file that
// pulls `@/server/llm.server` at module scope into the client graph.
import { chatCompletion, resolveTextChatModel } from "@/server/llm.server";
import { LABEL_BY_SLUG, type SwarmRole } from "@/serverfns/swarm.functions";

export type DraftResult = {
  model: string;
  label: string;
  role?: SwarmRole | null;
  roleLabel?: string | null;
  status: "ok" | "error";
  content: string;
  error?: string;
  latency_ms: number;
  tokens_in?: number;
  tokens_out?: number;
};

export const SYNTH_SYSTEM = `You are the arbiter of a multi-model swarm. You will receive several independent drafts written by other AI models in response to the same user prompt. Your job is to produce ONE final answer that is strictly better than any single draft: more accurate, more complete, better structured, and better calibrated in tone.

Rules:
- Silently reconcile disagreements. If a claim is contested and material, note the disagreement briefly ("sources differ on X"), don't pretend consensus.
- Prefer verifiable specifics over vague generalities. Drop hallucinations.
- Keep the strongest reasoning, examples, and structure from across the drafts. Do not lose useful detail.
- Do not mention the drafts, the models, "draft A", or the swarm process. Write as one coherent voice.
- Match the user's requested length/format. If they asked for markdown, code, or a list, deliver that.
- If drafts are all weak, answer from your own capability rather than parroting them.`;

export async function draftOne(
  model: string,
  userContent: string,
  systemPrompt: string,
): Promise<DraftResult> {
  const label = LABEL_BY_SLUG.get(model) ?? model;
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const json = await Promise.race([
      chatCompletion({
        model: resolveTextChatModel(model),
        temperature: 0.6,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      new Promise<never>((_, rej) =>
        controller.signal.addEventListener("abort", () => rej(new Error("timeout"))),
      ),
    ]);
    clearTimeout(timer);
    const content = json?.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("empty response");
    return {
      model,
      label,
      status: "ok",
      content,
      latency_ms: Date.now() - started,
      tokens_in: json?.usage?.prompt_tokens,
      tokens_out: json?.usage?.completion_tokens,
    };
  } catch (e: any) {
    return {
      model,
      label,
      status: "error",
      content: "",
      error: e?.message ?? String(e),
      latency_ms: Date.now() - started,
    };
  }
}

export async function synthesize(
  synthModel: string,
  userPrompt: string,
  draftBlock: string,
): Promise<string> {
  const json = await chatCompletion({
    model: resolveTextChatModel(synthModel),
    temperature: 0.3,
    messages: [
      { role: "system", content: SYNTH_SYSTEM },
      {
        role: "user",
        content: `USER PROMPT:\n${userPrompt}\n\n---\n\nINDEPENDENT DRAFTS:\n\n${draftBlock}\n\n---\n\nProduce the final, unified answer now.`,
      },
    ],
  });
  return json?.choices?.[0]?.message?.content?.trim() ?? "";
}
