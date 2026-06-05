import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Shared workspace connectors: builders connect Gmail + LinkedIn once in
// Lovable Connectors. The app reads the connector env vars to know whether
// the connection is live — no per-user OAuth, no popups.

export const getConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    gmail: Boolean(process.env.GOOGLE_MAIL_API_KEY && process.env.LOVABLE_API_KEY),
    linkedin: Boolean(process.env.LINKEDIN_API_KEY && process.env.LOVABLE_API_KEY),
  }));

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
