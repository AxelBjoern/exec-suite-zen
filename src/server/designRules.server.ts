// Per-user LinkedIn image design rules. axel@natax.co.uk inherits the VDNX
// brand defaults; everyone else uses what they save in /settings (or no rules).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const VDNX_OWNER_EMAIL = "axel@natax.co.uk";

export function isVdnxOwner(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === VDNX_OWNER_EMAIL;
}

export const VDNX_DESIGN_RULES = `VDNX brand visual rules:
- Institutional, editorial, premium fintech aesthetic. No gimmicks, no emoji, no stock-photo cliches.
- Color palette: VDNX Navy hsl(213 52% 24%) as the dominant tone; VDNX Gold hsl(42 49% 59%) for a single high-contrast accent; deep neutrals (off-black, warm white) for negative space.
- Typography: bold, modern geometric sans-serif. Sentence case. No script, no serif display.
- Composition: lots of negative space, strong asymmetric grid, single dominant subject. Square 1:1.
- Mood: governance, verifiability, institutional credibility, calm authority. Not "tech startup" energy.
- Avoid: rainbow gradients, purple/pink, dashboards-on-screens cliche, hands-on-keyboard, generic AI swirls, watermarks, logos.`;

export async function getDesignRulesForUser(opts: {
  userId: string;
  email?: string | null;
}): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("design_rules")
    .eq("user_id", opts.userId)
    .maybeSingle();
  const stored = (data?.design_rules ?? "").trim();
  if (stored) return stored;
  if ((opts.email ?? "").toLowerCase() === VDNX_OWNER_EMAIL) return VDNX_DESIGN_RULES;
  return null;
}
