// Self-hosted Playwright worker client. Server-only.
// Calls a remote Node+Playwright service that runs recipe scripts in a real
// browser (needed for legacy/SPA pages that can't be hit with plain fetch).
//
// Env:
//   PLAYWRIGHT_WORKER_URL    e.g. https://vdnx-playwright.fly.dev
//   PLAYWRIGHT_WORKER_SECRET HMAC-SHA256 shared secret
//
// See docs/playwright-worker.md for the worker repo contract.

export type PlaywrightRunInput = {
  script: string;
  inputs?: Record<string, unknown>;
  session?: Record<string, unknown> | null;
  timeout_ms?: number;
};

export type PlaywrightRunResult = {
  ok: boolean;
  output?: unknown;
  logs?: string[];
  screenshots?: { name: string; storage_path: string; url?: string }[];
  error?: string;
};

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function runPlaywrightScript(input: PlaywrightRunInput): Promise<PlaywrightRunResult> {
  const base = process.env.PLAYWRIGHT_WORKER_URL;
  const secret = process.env.PLAYWRIGHT_WORKER_SECRET;
  if (!base || !secret) {
    return {
      ok: false,
      error: "Playwright worker not configured. Deploy the worker (see docs/playwright-worker.md) and set PLAYWRIGHT_WORKER_URL + PLAYWRIGHT_WORKER_SECRET.",
    };
  }
  const url = base.replace(/\/+$/, "") + "/run";
  const body = JSON.stringify({
    script: input.script,
    inputs: input.inputs ?? {},
    session: input.session ?? null,
    timeout_ms: input.timeout_ms ?? 60_000,
  });
  const signature = await hmacSha256Hex(secret, body);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pw-signature": signature },
      body,
      signal: AbortSignal.timeout((input.timeout_ms ?? 60_000) + 5_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `worker ${res.status}: ${text.slice(0, 500)}` };
    }
    try {
      return JSON.parse(text) as PlaywrightRunResult;
    } catch {
      return { ok: false, error: `worker returned non-JSON: ${text.slice(0, 300)}` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
