// CLI entry for the VDNX probe harness.
//
// Usage:
//   bun scripts/probe-vdnx.ts \
//     --agent exec-command/governance-probe \
//     --email sandbox-operator@vdnx.app \
//     --routes /dashboard,/governance \
//     --verbs command-catalog
//
// Requires: VDNX_AGENT_HMAC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// in env. Playwright must be installed locally (`bun add -d playwright &&
// bunx playwright install chromium`).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runProbe, type ProbeReport } from "../src/server/vdnx-probe-runner.server";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const agentId = arg("agent");
  const targetEmail = arg("email");
  if (!agentId || !targetEmail) {
    console.error("usage: --agent <id> --email <sandbox-email> [--routes a,b] [--verbs p1,p2] [--app-url URL]");
    process.exit(2);
  }
  const routes = arg("routes")?.split(",").filter(Boolean) ?? [];
  const verbs = arg("verbs")?.split(",").filter(Boolean).map(path => ({ path })) ?? [];
  const appUrl = arg("app-url");

  const reports = await runProbe({ agentId, targetEmail, appUrl, routes, verbs });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — printing reports only");
    console.log(JSON.stringify(reports, null, 2));
    return;
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const persisted: ProbeReport[] = [];
  for (const r of reports) {
    let screenshot_url: string | undefined;
    if (r.screenshot_path) {
      const bytes = readFileSync(r.screenshot_path);
      const objectPath = `${agentId.replace(/\W+/g, "_")}/${basename(r.screenshot_path)}`;
      const up = await admin.storage
        .from("vdnx-probe-screenshots")
        .upload(objectPath, bytes, { contentType: "image/png", upsert: true });
      if (up.error) console.error("screenshot upload failed", up.error.message);
      else screenshot_url = objectPath;
    }
    const { error } = await admin.from("vdnx_probe_reports").insert({
      agent_id: r.agent_id,
      target_email: r.target_email,
      route: r.route,
      verb: r.verb,
      status: r.status,
      latency_ms: r.latency_ms,
      console_errors: r.console_errors,
      network_failures: r.network_failures,
      screenshot_url,
    });
    if (error) console.error("insert failed", error.message);
    persisted.push({ ...r, screenshot_path: screenshot_url });
  }

  console.log(JSON.stringify(persisted, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
