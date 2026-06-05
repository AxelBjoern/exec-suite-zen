import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authorizeAppUserOAuth, callAsAppUser } from "@/integrations/lovable/appUserConnector";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

const PROVIDER_META = {
  gmail: {
    connectorIdAuth: "google",
    connectorIdCall: "google_mail",
    clientIdEnv: "GOOGLE_APP_USER_CONNECTOR_CLIENT_ID",
    scopes: ["https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
  },
  linkedin: {
    connectorIdAuth: "linkedin",
    connectorIdCall: "linkedin",
    clientIdEnv: "LINKEDIN_APP_USER_CONNECTOR_CLIENT_ID",
    scopes: ["w_member_social", "openid", "profile", "email"],
  },
} as const;

type Provider = keyof typeof PROVIDER_META;

const StartInput = z.object({
  provider: z.enum(["gmail", "linkedin"]),
  targetOrigin: z.string().url(),
});

export const startConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => StartInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const meta = PROVIDER_META[data.provider as Provider];
    const clientId = process.env[meta.clientIdEnv];
    const providerLabel = data.provider === "gmail" ? "Gmail" : "LinkedIn";
    if (!clientId) {
      return {
        unsupported: true as const,
        message: `${providerLabel} personal connect isn't configured. Sends use the shared workspace account.`,
      };
    }

    try {
      const { authorizationUrl } = await authorizeAppUserOAuth({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectorId: meta.connectorIdAuth,
        appUserId: userId,
        connectorClientId: clientId,
        returnUrl: `${data.targetOrigin}/settings/connections`,
        responseMode: "web_message",
        webMessageTargetOrigin: data.targetOrigin,
        credentialsConfiguration: { scopes: meta.scopes },
      });
      return { unsupported: false as const, authorizationUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start personal connect";
      if (message.includes("connector_not_found")) {
        return {
          unsupported: true as const,
          message: `${providerLabel} personal connect isn't available for this workspace yet. Sends use the shared workspace account.`,
        };
      }
      throw error;
    }
  });

const SaveInput = z.object({
  provider: z.enum(["gmail", "linkedin"]),
  connectionId: z.string().min(1),
});

export const saveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const meta = PROVIDER_META[data.provider as Provider];

    // Fetch profile so we can show the connected account name
    let providerEmail: string | null = null;
    let providerName: string | null = null;
    try {
      if (data.provider === "gmail") {
        const r = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionId: data.connectionId,
          connectorId: meta.connectorIdCall,
          path: "/gmail/v1/users/me/profile",
        });
        if (r.ok) {
          const p = (await r.json()) as { emailAddress?: string };
          providerEmail = p.emailAddress ?? null;
        }
      } else {
        const r = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionId: data.connectionId,
          connectorId: meta.connectorIdCall,
          path: "/v2/userinfo",
        });
        if (r.ok) {
          const p = (await r.json()) as { email?: string; name?: string };
          providerEmail = p.email ?? null;
          providerName = p.name ?? null;
        }
      }
    } catch {
      /* non-fatal */
    }

    const { error } = await supabaseAdmin
      .from("user_connections")
      .upsert(
        {
          user_id: userId,
          provider: data.provider,
          connection_id: data.connectionId,
          provider_email: providerEmail,
          provider_name: providerName,
        },
        { onConflict: "user_id,provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, providerEmail, providerName };
  });

export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data, error } = await supabaseAdmin
      .from("user_connections")
      .select("provider, provider_email, provider_name, connected_at")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    // Check if providers are configured in env
    const gmailConfigured = !!process.env.GOOGLE_APP_USER_CONNECTOR_CLIENT_ID;
    const linkedinConfigured = !!process.env.LINKEDIN_APP_USER_CONNECTOR_CLIENT_ID;

    return { rows: data ?? [], config: { gmail: gmailConfigured, linkedin: linkedinConfigured } };
  });

export const disconnectProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ provider: z.enum(["gmail", "linkedin"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin
      .from("user_connections")
      .delete()
      .eq("user_id", userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Settings (auto-send toggles + design rules) ────────────────────────
export const getMySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const { data } = await supabaseAdmin
      .from("user_settings")
      .select("auto_send_email, auto_send_linkedin, design_rules")
      .eq("user_id", userId)
      .maybeSingle();
    // Surface the VDNX default to axel so the textarea isn't empty.
    const { VDNX_DESIGN_RULES } = await import("@/server/designRules.server");
    const isVdnxOwner = (claims?.email ?? "").toLowerCase() === "axel@natax.co.uk";
    return {
      auto_send_email: data?.auto_send_email ?? false,
      auto_send_linkedin: data?.auto_send_linkedin ?? false,
      design_rules: data?.design_rules ?? (isVdnxOwner ? VDNX_DESIGN_RULES : ""),
      design_rules_default_applied: !data?.design_rules && isVdnxOwner,
    };
  });

const SettingsInput = z.object({
  auto_send_email: z.boolean(),
  auto_send_linkedin: z.boolean(),
  design_rules: z.string().max(4000).optional().nullable(),
});

export const updateMySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SettingsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          auto_send_email: data.auto_send_email,
          auto_send_linkedin: data.auto_send_linkedin,
          design_rules: data.design_rules ?? null,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
