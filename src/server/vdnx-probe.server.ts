// Server-only helper for signing into a VDNX sandbox tenant as an agent.
// Calls VDNX's signature-gated `agent-signin` edge function, then exchanges
// the returned `token_hash` for a real Supabase session via verifyOtp.
//
// SANDBOX ONLY. The endpoint refuses production users. Never call from
// client code. Never log the JWT or the HMAC secret.

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

// VDNX is a separate Supabase project from this one. URL + anon are public.
export const VDNX_SUPABASE_URL = "https://qumqodukmflucvivblqx.supabase.co";
export const VDNX_SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1bXFvZHVrbWZsdWN2aXZibHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5Nzg0OTYsImV4cCI6MjA2MTU1NDQ5Nn0.-qusc7ibJfkwKIdefcEsBWQ7gpE3z6vllUlUlqMCKvQ";
export const VDNX_STORAGE_KEY = "sb-qumqodukmflucvivblqx-auth-token";
export const VDNX_AGENT_SIGNIN_URL = `${VDNX_SUPABASE_URL}/functions/v1/agent-signin`;

export interface AgentSession {
  supabase: SupabaseClient;
  session: Session;
}

async function signAgentJwt(targetEmail: string, agentId: string): Promise<string> {
  const secret = process.env.VDNX_AGENT_HMAC_SECRET;
  if (!secret) throw new Error("VDNX_AGENT_HMAC_SECRET missing");
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({ agent_id: agentId, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(targetEmail)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(key);
}

export async function signInAsAgent(
  targetEmail: string,
  agentId: string,
): Promise<AgentSession> {
  if (!targetEmail || !agentId) throw new Error("targetEmail and agentId required");

  const token = await signAgentJwt(targetEmail, agentId);
  const res = await fetch(VDNX_AGENT_SIGNIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = (await res.json().catch(() => ({}))) as { token_hash?: string; error?: string };
  if (!res.ok || !body.token_hash) {
    // Do not retry — refusal is intentional (prod user, replay, expired JWT, etc.)
    throw new Error(`agent-signin failed [${res.status}]: ${body.error ?? JSON.stringify(body)}`);
  }

  const supabase = createClient(VDNX_SUPABASE_URL, VDNX_SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: body.token_hash,
  });
  if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message ?? "no session"}`);

  return { supabase, session: data.session };
}
