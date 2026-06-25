// Executes a single node of a workflow_runs row. Called from the job_queue
// tick for kind="workflow_step". Each step either: (a) completes and enqueues
// the next node, (b) parks the run on a human_review approval, or (c) marks
// the run completed/failed when there are no more nodes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, resolveTextChatModel } from "@/server/llm.server";
import { VIBE_CODER_AUTOMATOR_PROMPT } from "@/lib/vibe-coder-prompt";

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type LogEntry = { ts: string; node_id: string; level: "info" | "warn" | "error"; message: string; data?: any };

async function appendLog(runId: string, entry: LogEntry, existing: any[]) {
  const next = [...existing, entry];
  await supabaseAdmin.from("workflow_runs").update({ log: next }).eq("id", runId).select();
  return next;
}

async function finish(runId: string, status: "completed" | "failed", existing: any[], reason?: string) {
  if (reason) existing = await appendLog(runId, { ts: new Date().toISOString(), node_id: "_end", level: status === "failed" ? "error" : "info", message: reason }, existing);
  await supabaseAdmin.from("workflow_runs").update({
    status, finished_at: new Date().toISOString(),
  }).eq("id", runId).select();
}

// Walk previously appended log entries, find ones tagged with node_id
// and `.data.output`, and expose them as `steps[node_id].output` for
// Mustache-style interpolation: `{{steps.<id>.output.<path>}}`.
function buildStepsCtx(log: any[]): Record<string, { output: unknown }> {
  const ctx: Record<string, { output: unknown }> = {};
  for (const entry of log) {
    const id = entry?.node_id;
    const out = entry?.data?.output;
    if (id && out !== undefined) ctx[id] = { output: out };
  }
  return ctx;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const seg of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

const TEMPLATE_RE = /\{\{\s*steps\.([a-zA-Z0-9_\-]+)\.output(?:\.([a-zA-Z0-9_.\-]+))?\s*\}\}/g;

function interpolate(value: any, steps: Record<string, { output: unknown }>): any {
  if (typeof value === "string") {
    return value.replace(TEMPLATE_RE, (_m, id, path) => {
      const step = steps[id];
      if (!step) return "";
      const v = path ? getPath(step.output, path) : step.output;
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, steps));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolate(v, steps);
    return out;
  }
  return value;
}

export async function runWorkflowStep(payload: { run_id: string; node_index: number }) {
  const { data: run, error } = await supabaseAdmin
    .from("workflow_runs").select("*, workflows(nodes, name)").eq("id", payload.run_id).single();
  if (error || !run) throw new Error(`workflow_run ${payload.run_id} not found: ${error?.message}`);

  const nodes = (run.workflows?.nodes ?? []) as Array<{ id: string; type: string; label: string; config: any }>;
  const idx = payload.node_index;
  let log: any[] = Array.isArray(run.log) ? run.log : [];
  const steps = buildStepsCtx(log);

  if (idx >= nodes.length) {
    await finish(payload.run_id, "completed", log, "All nodes complete.");
    return;
  }

  const rawNode = nodes[idx];
  const node = { ...rawNode, config: interpolate(rawNode.config ?? {}, steps) };
  await supabaseAdmin.from("workflow_runs").update({
    status: "running", current_node_id: node.id,
  }).eq("id", payload.run_id).select();

  try {
    switch (node.type) {
      case "trigger": {
        log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "info", message: `Trigger fired: ${node.label}` }, log);
        break;
      }
      case "llm_step": {
        const prompt: string = node.config?.prompt ?? node.label;
        const model = resolveTextChatModel(node.config?.model ?? "grok");
        const res = await chatCompletion({
          model,
          messages: [
            { role: "system", content: VIBE_CODER_AUTOMATOR_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        });
        const text: string = res?.choices?.[0]?.message?.content ?? "";
        log = await appendLog(payload.run_id, {
          ts: new Date().toISOString(), node_id: node.id, level: "info",
          message: `LLM (${model}): ${text.slice(0, 280)}${text.length > 280 ? "…" : ""}`,
          data: { full: text, model, output: text },
        }, log);
        break;
      }
      case "tool_call": {
        const { executeToolCall } = await import("@/server/agent-tools.server");
        const toolName: string = node.config?.tool;
        if (!toolName) throw new Error("tool_call node missing config.tool");
        const result = await executeToolCall(toolName, node.config?.input ?? {}, {
          agent_slug: "workflow-runner",
          owner_user_id: run.user_id,
        });
        if (!result.ok) throw new Error(`tool ${toolName}: ${result.error}`);
        log = await appendLog(payload.run_id, {
          ts: new Date().toISOString(), node_id: node.id, level: "info",
          message: `Tool ${toolName} ok`,
          data: { tool: toolName, output: result.result },
        }, log);
        break;
      }
      case "playwright_step": {
        const { runPlaywrightScript } = await import("@/server/playwright-client.server");
        const script: string = node.config?.script;
        if (!script) throw new Error("playwright_step node missing config.script");
        const res = await runPlaywrightScript({ script, inputs: node.config?.inputs ?? {} });
        if (!res.ok) throw new Error(`playwright ${script}: ${res.error}`);
        log = await appendLog(payload.run_id, {
          ts: new Date().toISOString(), node_id: node.id, level: "info",
          message: `Playwright ${script} ok${res.screenshots?.length ? ` (${res.screenshots.length} screenshot)` : ""}`,
          data: { script, output: res.output, logs: res.logs?.slice(0, 20), screenshots: res.screenshots },
        }, log);
        break;
      }
      case "human_review": {
        const { data: appr, error: aErr } = await supabaseAdmin.from("approvals").insert({
          kind: "task", status: "pending", requester_id: run.user_id,
          payload: { workflow_run_id: payload.run_id, node_id: node.id, label: node.label, workflow_name: run.workflows?.name },
          ref_table: "workflow_runs", ref_id: payload.run_id,
        }).select().single();
        if (aErr) throw new Error(aErr.message);
        log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "info", message: `Awaiting human approval: ${node.label}`, data: { approval_id: appr.id } }, log);
        await supabaseAdmin.from("workflow_runs").update({
          status: "awaiting_approval", approval_id: appr.id,
        }).eq("id", payload.run_id).select();
        return; // do NOT enqueue next step
      }
      case "action": {
        const action = node.config?.action ?? "noop";
        // Sovereignty-first: actions are recorded as audit + (when applicable)
        // routed through the existing approvals flow rather than firing live.
        const auditPayload = { run_id: payload.run_id, node_id: node.id, config: node.config };
        const hash_self = await sha256Hex(JSON.stringify(auditPayload));
        await supabaseAdmin.from("audit_log").insert({
          actor: "system", agent_slug: "workflow-runner",
          action: `workflow.action.${action}`,
          target: payload.run_id, payload: auditPayload, hash_self,
        }).select();
        log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "info", message: `Action recorded: ${action}` }, log);
        break;
      }
      case "output": {
        await supabaseAdmin.from("decision_log").insert({
          agent_slug: "workflow-runner",
          title: `Workflow output: ${node.label}`,
          decision: node.config?.summary ?? node.label,
          rationale: `From workflow run ${payload.run_id}`,
          amendments: [{ run_id: payload.run_id, node }],
        }).select();
        log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "info", message: `Output written: ${node.label}` }, log);
        break;
      }
      case "vdnx_route_probe": {
        const { runVdnxRouteProbe } = await import("@/server/vdnx-route-probe.server");
        const cfg = (node.config ?? {}) as { email?: string; base_url?: string; routes?: any[] };
        const routes = Array.isArray(cfg.routes) ? cfg.routes : [];
        if (!routes.length) {
          log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "warn", message: "No routes configured. Run 'Discover VDNX wizards' first." }, log);
          break;
        }
        const { rows, summary } = await runVdnxRouteProbe({
          run_id: payload.run_id,
          email: cfg.email,
          base_url: cfg.base_url,
          routes,
        });
        log = await appendLog(payload.run_id, {
          ts: new Date().toISOString(), node_id: node.id, level: summary.failures > 0 ? "warn" : "info",
          message: `Probed ${summary.total} routes — ${summary.ok} ok, ${summary.failures} failing, ${summary.unknown} unknown (no marker match).`,
          data: { summary, sample: rows.slice(0, 5) },
        }, log);
        break;
      }
      default: {
        log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "warn", message: `Unknown node type: ${node.type}` }, log);
      }
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    log = await appendLog(payload.run_id, { ts: new Date().toISOString(), node_id: node.id, level: "error", message: msg, data: { stack: e?.stack } }, log);
    await finish(payload.run_id, "failed", log, `Node ${node.label} failed: ${msg}`);
    throw e;
  }

  // Enqueue next step
  if (idx + 1 >= nodes.length) {
    await finish(payload.run_id, "completed", log, "All nodes complete.");
  } else {
    await supabaseAdmin.from("job_queue").insert({
      kind: "workflow_step",
      payload: { run_id: payload.run_id, node_index: idx + 1 },
    }).select();
  }
}
