// Playwright-driven probe runner for sandbox VDNX tenants.
//
// REQUIRES a Node host with Playwright + Chromium installed. Cannot run in
// the Cloudflare Worker SSR runtime. Invoke from `scripts/probe-vdnx.ts` or
// a separate Node worker. Do NOT wire into createServerFn.

import { signInAsAgent, VDNX_STORAGE_KEY } from "./vdnx-probe.server";

export interface ProbeInput {
  agentId: string;
  targetEmail: string;
  appUrl?: string;
  routes?: string[];
  verbs?: { path: string; body?: unknown }[];
}

export interface ProbeReport {
  agent_id: string;
  target_email: string;
  route?: string;
  verb?: string;
  status: "ok" | "error" | "refused";
  latency_ms: number;
  console_errors: string[];
  network_failures: { url: string; status?: number; failure?: string }[];
  screenshot_path?: string;
}

export async function runProbe(input: ProbeInput): Promise<ProbeReport[]> {
  const appUrl = input.appUrl ?? "https://vdnx.app";
  const routes = input.routes ?? [];
  const verbs = input.verbs ?? [];
  const reports: ProbeReport[] = [];

  const { supabase, session } = await signInAsAgent(input.targetEmail, input.agentId);

  // --- HTTP verb probes ---
  for (const v of verbs) {
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke(v.path, { body: v.body });
      reports.push({
        agent_id: input.agentId,
        target_email: input.targetEmail,
        verb: v.path,
        status: error ? "error" : "ok",
        latency_ms: Date.now() - t0,
        console_errors: error ? [error.message] : [],
        network_failures: [],
      });
      void data;
    } catch (e) {
      reports.push({
        agent_id: input.agentId,
        target_email: input.targetEmail,
        verb: v.path,
        status: "error",
        latency_ms: Date.now() - t0,
        console_errors: [(e as Error).message],
        network_failures: [],
      });
    }
  }

  // --- Browser route probes ---
  if (routes.length > 0) {
    // Dynamic import so this module is importable from Node-only entry points
    // without forcing Playwright to be resolved at build time elsewhere.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
      const page = await context.newPage();

      const storagePayload = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      });

      // Seed session on the app origin first.
      await page.goto(appUrl, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([k, v]) => window.localStorage.setItem(k, v),
        [VDNX_STORAGE_KEY, storagePayload] as const,
      );

      for (const route of routes) {
        const consoleErrors: string[] = [];
        const networkFailures: ProbeReport["network_failures"] = [];
        const onConsole = (msg: import("playwright").ConsoleMessage) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        };
        const onFailed = (req: import("playwright").Request) => {
          networkFailures.push({ url: req.url(), failure: req.failure()?.errorText });
        };
        const onResp = (resp: import("playwright").Response) => {
          if (resp.status() >= 400) networkFailures.push({ url: resp.url(), status: resp.status() });
        };
        page.on("console", onConsole);
        page.on("requestfailed", onFailed);
        page.on("response", onResp);

        const t0 = Date.now();
        let status: ProbeReport["status"] = "ok";
        let screenshot_path: string | undefined;
        try {
          await page.goto(new URL(route, appUrl).toString(), {
            waitUntil: "networkidle",
            timeout: 30_000,
          });
          screenshot_path = `/tmp/vdnx-probe-${input.agentId.replace(/\W+/g, "_")}-${Date.now()}.png`;
          await page.screenshot({ path: screenshot_path });
        } catch (e) {
          status = "error";
          consoleErrors.push((e as Error).message);
        }
        const latency_ms = Date.now() - t0;

        page.off("console", onConsole);
        page.off("requestfailed", onFailed);
        page.off("response", onResp);

        reports.push({
          agent_id: input.agentId,
          target_email: input.targetEmail,
          route,
          status,
          latency_ms,
          console_errors: consoleErrors,
          network_failures: networkFailures,
          screenshot_path,
        });
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }

  return reports;
}
