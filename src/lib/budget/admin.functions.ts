import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const promoteScenarioToVdnx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Owner gate via has_role security-definer RPC.
    const { data: isOwner, error: roleErr } = await (supabase as any)
      .rpc("has_role", { _user_id: userId, _role: "owner" });
    if (roleErr) throw new Error(roleErr.message);
    if (!isOwner) throw new Error("Only owners can promote scenarios to the VDNX baseline.");

    // Verify the row exists and is owned by the caller.
    const { data: row, error: readErr } = await (supabase as any)
      .from("budget_scenarios")
      .select("id, owner_id, name")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Scenario not found.");

    // Flip to system scenario (null owner so it shows up for everyone).
    const { error: updErr } = await (supabase as any)
      .from("budget_scenarios")
      .update({
        is_system: true,
        is_locked: true,
        owner_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { id: data.id, name: row.name };
  });
