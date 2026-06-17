// Server-only: drive a real Chromium remotely to sign into VDNX through
// the live web UI and capture the Supabase session out of localStorage.
//
// Uses Browserless's REST /function endpoint — we POST a script and they
// run it in their browser fleet, returning the JSON result. No Playwright
// or Chromium ever ships in our Worker bundle, so build stays small.
//
// Requires the BROWSERLESS_URL secret. Two accepted formats:
//   1. Full endpoint: https://chrome.browserless.io/function?token=XYZ
//   2. Base URL:      https://chrome.browserless.io           (token from BROWSERLESS_TOKEN)
//
// Never log the password or the captured tokens.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VDNX_STORAGE_KEY } from "@/server/vdnx-probe.server";

const DEFAULT_APP_URL = "https://app.vdnx.com";
const REQUEST_TIMEOUT_MS = 45_000;

export type BrowserSignInResult = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
};

function resolveEndpoint(): string {
  const url = process.env.BROWSERLESS_URL ?? process.env.BROWSERLESS_WS_URL;
  const token = process.env.BROWSERLESS_TOKEN;
  if (!url) {
    throw new Error(
      "BROWSERLESS_URL not set — cannot drive a remote browser. " +
        "Add a Browserless endpoint (e.g. https://chrome.browserless.io) as a secret.",
    );
  }
  // Convert wss:// → https:// for the REST API
  let base = url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  // If user passed a /function URL already, use as-is.
  if (/\/function(\?|$)/.test(base)) return base;
  // Strip trailing slash, append /function
  base = base.replace(/\/+$/, "");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}/function${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}

// The script executed inside the remote browser. Browserless exposes
// `page`, `context`, and `browser` as globals to a default-exported async fn.
// We return the parsed token object directly so the caller doesn't need to
// re-fetch anything.
const SCRIPT = `
export default async function ({ page, context: _ctx }) {
  const { authUrl, email, password, storageKey } = await page.evaluate(() => ({}));
  // arguments come in via the "context" field in the POST body
  return { __error: "should not reach here" };
}
`;

// Build the actual script with parameters interpolated as JSON literals.
function buildScript(authUrl: string, email: string, password: string, storageKey: string): string {
  return `
export default async function ({ page }) {
  const AUTH_URL = ${JSON.stringify(authUrl)};
  const EMAIL = ${JSON.stringify(email)};
  const PASSWORD = ${JSON.stringify(password)};
  const STORAGE_KEY = ${JSON.stringify(storageKey)};

  await page.goto(AUTH_URL, { waitUntil: "domcontentloaded", timeout: 20000 });

  // Fill credentials — try multiple selector strategies.
  const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="email"]';
  const passSel  = 'input[type="password"], input[name="password"]';
  await page.waitForSelector(emailSel, { timeout: 10000 });
  await page.fill(emailSel, EMAIL);
  await page.fill(passSel, PASSWORD);

  // Click sign-in. Try role/name first, fall back to type=submit.
  const buttons = await page.locator('button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue"), button[type="submit"]').all();
  if (buttons.length === 0) throw new Error("sign-in button not found");
  await buttons[0].click({ timeout: 10000 });

  // Wait for Supabase to write the auth token to localStorage.
  const raw = await page.waitForFunction(
    (k) => window.localStorage.getItem(k),
    STORAGE_KEY,
    { timeout: 25000 }
  );
  const value = await raw.jsonValue();
  if (!value) throw new Error("auth token not present after sign-in");

  let parsed;
  try { parsed = JSON.parse(value); }
  catch { throw new Error("failed to parse Supabase auth token from localStorage"); }

  const access_token = parsed?.access_token ?? parsed?.currentSession?.access_token;
  const refresh_token = parsed?.refresh_token ?? parsed?.currentSession?.refresh_token;
  const expires_at = parsed?.expires_at ?? parsed?.currentSession?.expires_at;
  if (!access_token || !refresh_token) throw new Error("session tokens missing from payload");

  return {
    data: { access_token, refresh_token, expires_at: expires_at ?? null },
    type: "application/json"
  };
}
`;
}

async function saveScreenshotMaybe(payload: unknown, email: string): Promise<string | null> {
  // Browserless /function returns JSON; on failure there is no screenshot to
  // save. Reserved for a future variant that captures a screenshot on error.
  void payload;
  void email;
  return null;
}

export async function signInVdnxViaBrowser(opts: {
  email: string;
  password: string;
  appUrl?: string;
}): Promise<BrowserSignInResult> {
  const endpoint = resolveEndpoint();
  const appUrl = (opts.appUrl ?? process.env.VDNX_APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, "");
  const authUrl = `${appUrl}/auth`;

  const code = buildScript(authUrl, opts.email, opts.password, VDNX_STORAGE_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/javascript" },
      body: code,
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new Error(
      `VDNX browser sign-in failed for ${opts.email}: remote browser request failed: ${e?.message ?? String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `VDNX browser sign-in failed for ${opts.email}: Browserless ${res.status}: ${bodyText.slice(0, 500)}`,
    );
  }

  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(
      `VDNX browser sign-in failed for ${opts.email}: Browserless returned non-JSON: ${bodyText.slice(0, 200)}`,
    );
  }

  // Browserless wraps the return value; older revs put it at root, newer at .data
  const inner = body?.data ?? body;
  const access_token: string | undefined = inner?.access_token;
  const refresh_token: string | undefined = inner?.refresh_token;
  const expires_at: number | undefined = inner?.expires_at ?? undefined;

  if (!access_token || !refresh_token) {
    await saveScreenshotMaybe(body, opts.email);
    throw new Error(
      `VDNX browser sign-in failed for ${opts.email}: response missing tokens: ${bodyText.slice(0, 300)}`,
    );
  }

  return {
    access_token,
    refresh_token,
    expires_at: expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    email: opts.email,
  };
}

// Reference imports kept so tree-shaker doesn't drop them — supabaseAdmin
// is used by callers that import this module's siblings, and keeping the
// import here avoids accidental circular reorgs later.
void supabaseAdmin;
