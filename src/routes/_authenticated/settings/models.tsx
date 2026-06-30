import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Cpu } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CHAT_MODEL_OPTIONS, type ChatModelOption } from "@/lib/chat-models";
import {
  getMyModelAllowlist,
  updateMyModelAllowlist,
} from "@/lib/models.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings/models")({
  head: () => ({
    meta: [
      { title: "VDNX — Models" },
      { name: "description", content: "Pick which chat models appear in your model picker." },
    ],
  }),
  component: ModelsPage,
});

function ModelsPage() {
  const qc = useQueryClient();
  const get = useServerFn(getMyModelAllowlist);
  const update = useServerFn(updateMyModelAllowlist);

  const allowlist = useQuery({
    queryKey: ["my-model-allowlist"],
    queryFn: () => get(),
  });
  const { data: libraryModels = [] } = useQuery({
    queryKey: ["settings", "base-models"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("base_models")
        .select("slug,name,provider,description")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        slug: string;
        name: string;
        provider?: string | null;
        description?: string | null;
      }>;
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (allowlist.data) setSelected(new Set(allowlist.data.allowed));
  }, [allowlist.data]);

  const modelOptions = useMemo(() => {
    const byId = new Map<string, ChatModelOption>(
      CHAT_MODEL_OPTIONS.map((m) => [m.id, { ...m }]),
    );
    for (const m of libraryModels) {
      const slug = m.slug?.trim();
      if (!slug || [...byId.values()].some((existing) => existing.slug === slug)) continue;
      byId.set(slug, {
        id: slug,
        slug,
        label: m.name?.trim() || slug,
        provider: m.provider ?? "openrouter",
        description: m.description ?? undefined,
        source: "library" as const,
      });
    }
    for (const m of allowlist.data?.options ?? []) {
      if (!byId.has(m.id)) byId.set(m.id, m);
    }
    return Array.from(byId.values());
  }, [allowlist.data?.options, libraryModels]);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allOn = useMemo(
    () => modelOptions.every((m) => selected.has(m.id)),
    [modelOptions, selected],
  );

  async function save() {
    if (selected.size === 0) {
      toast.error("Enable at least one model");
      return;
    }
    setSaving(true);
    try {
      await update({ data: { allowed: Array.from(selected) } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["my-model-allowlist"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Models
        </p>
      </div>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">
        Chat models
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick which models appear in your chat picker. Disabled models stay
        blocked even if requested directly.
      </p>

      <section className="mt-6 rounded-lg border border-border bg-panel p-2">
        <ul className="divide-y divide-border">
          {modelOptions.map((m) => {
            const on = selected.has(m.id);
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {m.slug}
                  </div>
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(v) => toggle(m.id, v)}
                  aria-label={`Toggle ${m.label}`}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() =>
            setSelected(
              allOn ? new Set() : new Set(modelOptions.map((m) => m.id)),
            )
          }
        >
          {allOn ? "Disable all" : "Enable all"}
        </button>
        <Button onClick={save} disabled={saving || allowlist.isLoading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </main>
  );
}
