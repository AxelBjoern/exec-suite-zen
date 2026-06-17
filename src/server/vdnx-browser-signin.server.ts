// Server-only: drive a real Chromium via remote CDP (Browserless or any
// Playwright grid) to sign into VDNX through the live web UI. Captures the
// Supabase session out of localStorage so the rest of the probe pipeline
// can reuse it. Bypasses the disabled legacy API key problem entirely —
// the browser uses whatever key VDNX's own bundle ships.
//
// Requires the BROWSERLESS_WS_URL secret (e.g. wss://chrome.browserless.io?token=...).
// Never log the password or the captured tokens.

import { chromium } from "playwright-core";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VDNX_STORAGE_KEY } from "@/server/vdnx-probe.server";

const DEFAULT_APP_URL = "https://app.vdnx.com";
const NAV_TIMEOUT_MS = 15_000;
const FIELD_TIMEOUT_MS = 8_000;
const SUBMIT_TIMEOUT_MS = 20_000;

export type BrowserSignInResult = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  email: string;
};

async function uploadScreenshot(bytes: Buffer, email: string): Promise<string | null> {
  try {
    const path = `signin-failures/${email}/${Date.now()}.png`;
    const { error } = await supabaseAdmin.storage
      .from("vdnx-probe-screenshots")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (error) return null;
    const { data } = await supabaseAdmin.storage
      .from("vdnx-probe-screenshots")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function signInVdnxViaBrowser(opts: {
  email: string;
  password: string;
  appUrl?: string;
}): Promise<BrowserSignInResult> {
  const wsUrl = process.env.BROWSERLESS_WS_URL;
  if (!wsUrl) {
    throw new Error(
      "BROWSERLESS_WS_URL not set — cannot drive a remote browser. " +
        "Add a Browserless (or compatible Playwright-CDP) endpoint as a secret.",
    );
  }
  const appUrl = (opts.appUrl ?? process.env.VDNX_APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, "");
  const authUrl = `${appUrl}/auth`;

  const browser = await chromium.connectOverCDP(wsUrl);
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let screenshotUrl: string | null = null;

  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();

    await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

    // Fill credentials — prefer role/name selectors, fall back to type-based.
    const emailField = page
      .getByLabel(/email/i)
      .or(page.locator('input[type="email"]'))
      .first();
    const passwordField = page
      .getByLabel(/password/i)
      .or(page.locator('input[type="password"]'))
      .first();

    await emailField.waitFor({ state: "visible", timeout: FIELD_TIMEOUT_MS });
    await emailField.fill(opts.email);
    await passwordField.fill(opts.password);

    const submit = page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .first();
    await submit.click({ timeout: FIELD_TIMEOUT_MS });

    // Wait for the auth-token to appear in localStorage; tolerates redirect.
    const storagePayload = await page.waitForFunction(
      (key) => window.localStorage.getItem(key),
      VDNX_STORAGE_KEY,
      { timeout: SUBMIT_TIMEOUT_MS },
    );
    const raw = (await storagePayload.jsonValue()) as string | null;
    if (!raw) throw new Error("Supabase auth token not present after sign-in");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error("Failed to parse Supabase auth token from localStorage");
    }
    const access_token: string | undefined = parsed?.access_token ?? parsed?.currentSession?.access_token;
    const refresh_token: string | undefined = parsed?.refresh_token ?? parsed?.currentSession?.refresh_token;
    const expires_at: number | undefined = parsed?.expires_at ?? parsed?.currentSession?.expires_at;
    if (!access_token || !refresh_token) {
      throw new Error("Sign-in succeeded but session tokens missing from localStorage payload");
    }

    return {
      access_token,
      refresh_token,
      expires_at: expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      email: opts.email,
    };
  } catch (err: any) {
    if (context) {
      try {
        const pages = context.pages();
        const page = pages[pages.length - 1];
        if (page) {
          const bytes = await page.screenshot({ type: "png" });
          screenshotUrl = await uploadScreenshot(Buffer.from(bytes), opts.email);
        }
      } catch {
        /* swallow */
      }
    }
    const base = err?.message ?? String(err);
    throw new Error(
      `VDNX browser sign-in failed for ${opts.email}: ${base}` +
        (screenshotUrl ? ` (screenshot: ${screenshotUrl})` : ""),
    );
  } finally {
    try {
      if (context) await context.close();
    } catch {
      /* swallow */
    }
    try {
      await browser.close();
    } catch {
      /* swallow */
    }
  }
}
