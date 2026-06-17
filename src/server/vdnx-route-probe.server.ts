// Server-only: probe a list of vdnx.app routes with the test account's
// session attached. HTTP-only (no Playwright). Records one row per route
// in vdnx_route_probe_results and returns a summary the runner appends
// to workflow_runs.log.
//
// Limits (per DeepSeek V4 Pro stress-test of the plan):
// - 4s per-route timeout
// - up to 6 routes probed concurrently
// - 25s global abort — remaining routes recorded as 'timeout_global'

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getVdnxSession } from "@/server/vdnx-session.server";

const PER_ROUTE_TIMEOUT_MS = 4000;
const GLOBAL_TIMEOUT_MS = 25000;
const CONCURRENCY = 6;
const BATCH_GAP_MS = 200;
const DEFAULT_BASE = "https://vdnx.app";
const USER_AGENT = "VDNX-Automate-Probe/1.0";

export type ProbeRouteSpec = { route: string; marker?: string | null; wizard?: string | null };

type ProbeRow = {
  run_id: string;
  route: string;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  wizard_loaded: "true" | "false" | "unknown";
  marker_checked: string | null;
  html_length: number | null;
  error: string | null;
};

export type ProbeSummary = {
  total: number;
  ok: number;
  failures: number;
  unknown: number;
  failing_routes: string[];
  sign_in_from_cache: boolean;
  sign_in_refreshed: boolean;
};

async function probeOne(
  baseUrl: string,
  spec: ProbeRouteSpec,
  accessToken: string,
  runId: string,
  globalDeadline: number,
): Promise<ProbeRow> {
  const route = spec.route;
  const marker = (spec.marker ?? "").trim() || null;
  const url = baseUrl.replace(/\/+$/, "") + (route.startsWith("/") ? route : "/" + route);

  const now = Date.now();
  const budget = Math.max(0, Math.min(PER_ROUTE_TIMEOUT_MS, globalDeadline - now));
  if (budget <= 0) {
    return {
      run_id: runId, route, status: "timeout_global", http_status: null, latency_ms: null,
      wizard_loaded: "unknown", marker_checked: marker, html_length: null,
      error: "global 25s deadline exceeded before route was probed",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
        "X-Probe-Run-Id": runId,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const latency = Date.now() - start;
    const httpStatus = res.status;
    let status = String(httpStatus);
    let wizardLoaded: "true" | "false" | "unknown" = "unknown";
    let htmlLen: number | null = null;
    let errMsg: string | null = null;

    if (httpStatus >= 300 && httpStatus < 400) {
      const loc = res.headers.get("location") ?? "";
      if (/\/(auth|login|sign-?in)/i.test(loc)) status = "auth_redirect";
    }

    // Only read body for 2xx and same-origin redirects
    if (httpStatus >= 200 && httpStatus < 300) {
      try {
        const html = await res.text();
        htmlLen = html.length;
        if (marker) wizardLoaded = html.includes(marker) ? "true" : "false";
      } catch (e: any) {
        errMsg = `body read failed: ${e?.message ?? String(e)}`;
      }
    } else if (httpStatus >= 400) {
      status = httpStatus === 404 ? "404" : "error";
      errMsg = `HTTP ${httpStatus}`;
    }

    return {
      run_id: runId, route, status, http_status: httpStatus, latency_ms: latency,
      wizard_loaded: wizardLoaded, marker_checked: marker, html_length: htmlLen, error: errMsg,
    };
  } catch (e: any) {
    const latency = Date.now() - start;
    const aborted = e?.name === "AbortError";
    return {
      run_id: runId, route, status: aborted ? "timeout" : "error",
      http_status: null, latency_ms: latency,
      wizard_loaded: "unknown", marker_checked: marker, html_length: null,
      error: aborted ? `per-route ${budget}ms timeout` : (e?.message ?? String(e)),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runVdnxRouteProbe(opts: {
  run_id: string;
  email?: string;
  base_url?: string;
  routes: Array<ProbeRouteSpec | string>;
}): Promise<{ rows: ProbeRow[]; summary: ProbeSummary }> {
  const email = opts.email ?? "cmd-ai-test@vdnx.app";
  const baseUrl = opts.base_url ?? DEFAULT_BASE;
  const specs: ProbeRouteSpec[] = opts.routes.map((r) =>
    typeof r === "string" ? { route: r, marker: null, wizard: null } : r,
  );

  // Sign in (or use cached session) — failure here fails the whole node.
  const session = await getVdnxSession({ email });
  const globalDeadline = Date.now() + GLOBAL_TIMEOUT_MS;

  const rows: ProbeRow[] = [];
  // Batched concurrency
  for (let i = 0; i < specs.length; i += CONCURRENCY) {
    if (Date.now() >= globalDeadline) {
      // record remaining as global timeout
      for (let j = i; j < specs.length; j++) {
        rows.push({
          run_id: opts.run_id, route: specs[j].route, status: "timeout_global",
          http_status: null, latency_ms: null, wizard_loaded: "unknown",
          marker_checked: specs[j].marker ?? null, html_length: null,
          error: "global 25s deadline exceeded before batch started",
        });
      }
      break;
    }
    const slice = specs.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map((s) => probeOne(baseUrl, s, session.access_token, opts.run_id, globalDeadline)),
    );
    for (let k = 0; k < settled.length; k++) {
      const r = settled[k];
      if (r.status === "fulfilled") rows.push(r.value);
      else {
        rows.push({
          run_id: opts.run_id, route: slice[k].route, status: "error",
          http_status: null, latency_ms: null, wizard_loaded: "unknown",
          marker_checked: slice[k].marker ?? null, html_length: null,
          error: (r as PromiseRejectedResult).reason?.message ?? "probe crashed",
        });
      }
    }
    if (i + CONCURRENCY < specs.length) await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
  }

  // Batch insert (chunked to stay well under any payload limit)
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabaseAdmin.from("vdnx_route_probe_results").insert(chunk);
    if (error) throw new Error(`vdnx_route_probe_results insert failed: ${error.message}`);
  }

  const failures = rows.filter((r) => r.status !== "200" || r.wizard_loaded === "false");
  const summary: ProbeSummary = {
    total: rows.length,
    ok: rows.filter((r) => r.status === "200" && r.wizard_loaded !== "false").length,
    failures: failures.length,
    unknown: rows.filter((r) => r.wizard_loaded === "unknown" && r.status === "200").length,
    failing_routes: failures.slice(0, 10).map((r) => `${r.route} [${r.status}${r.wizard_loaded === "false" ? "/no-marker" : ""}]`),
    sign_in_from_cache: session.from_cache,
    sign_in_refreshed: session.refreshed,
  };
  return { rows, summary };
}
