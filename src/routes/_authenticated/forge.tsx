import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cpu, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/forge")({
  head: () => ({ meta: [{ title: "Forge — VDNX" }] }),
  component: ForgeShell,
});

function ForgeShell() {
  const { data: types } = useQuery({
    queryKey: ["forge", "agent_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agent_types")
        .select("id,name,industry,description")
        .eq("is_seed", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; industry: string; description: string }>;
    },
  });

  const { data: models } = useQuery({
    queryKey: ["forge", "base_models"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("base_models")
        .select("slug,name,provider,description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ slug: string; name: string; provider: string; description: string }>;
    },
  });

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <Cpu className="h-7 w-7 text-primary" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Module
          </p>
          <h1 className="font-serif text-3xl font-bold text-foreground">Forge</h1>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-panel p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Module scaffolded</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Forge tables (<code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">agent_types</code>,{" "}
              <code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">base_models</code>,{" "}
              <code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">trainings</code>,{" "}
              <code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">deployments</code>) are live
              with seeds. Full training UI, Colab notebook generator and deployment flow port in the next wave.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Seed agent types ({types?.length ?? 0})
          </h3>
          <ul className="space-y-1.5">
            {types?.slice(0, 10).map((t) => (
              <li
                key={t.id}
                className="rounded border border-border bg-panel-2 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{t.name}</span>{" "}
                <span className="text-xs text-muted-foreground">· {t.industry}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Base models ({models?.length ?? 0})
          </h3>
          <ul className="space-y-1.5">
            {models?.map((m) => (
              <li
                key={m.slug}
                className="rounded border border-border bg-panel-2 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{m.name}</span>{" "}
                <span className="text-xs text-muted-foreground">· {m.provider}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
