import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/forge")({
  ssr: false,
  head: () => ({ meta: [{ title: "Forge — VDNX" }] }),
  component: ForgeShell,
});

type AgentType = {
  id: string;
  name: string;
  industry: string;
  description: string;
  is_system: boolean;
};
type BaseModel = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string;
  is_system: boolean;
};

function ForgeShell() {
  const qc = useQueryClient();

  const { data: types = [] } = useQuery<AgentType[]>({
    queryKey: ["forge", "agent_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agent_types")
        .select("id,name,industry,description,is_system")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: models = [] } = useQuery<BaseModel[]>({
    queryKey: ["forge", "base_models"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("base_models")
        .select("id,slug,name,provider,description,is_system")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createAgent = useMutation({
    mutationFn: async (vars: { name: string; industry: string; description: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("agent_types").insert({
        owner_id: u.user.id,
        is_system: false,
        ...vars,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agent created");
      qc.invalidateQueries({ queryKey: ["forge", "agent_types"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const createModel = useMutation({
    mutationFn: async (vars: { slug: string; name: string; provider: string; description: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("base_models").insert({
        owner_id: u.user.id,
        is_system: false,
        ...vars,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Model added");
      qc.invalidateQueries({ queryKey: ["forge", "base_models"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: "agent_types" | "base_models"; id: string }) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["forge", v.table] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12">
      <Toaster theme="dark" position="top-right" />
      <div className="mb-8 flex items-center gap-3">
        <Cpu className="h-7 w-7 text-primary" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Module</p>
          <h1 className="font-serif text-3xl font-bold text-foreground">Forge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your private agents and models. Start blank — VDNX defaults are admin-only.
          </p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section
          title="Agent types"
          count={types.length}
          empty="No agents yet. Create your first one."
          items={types.map((t) => ({
            id: t.id,
            primary: t.name,
            secondary: `${t.industry}${t.description ? " · " + t.description : ""}`,
            system: t.is_system,
          }))}
          onDelete={(id) => remove.mutate({ table: "agent_types", id })}
          form={
            <AgentForm onSubmit={(v) => createAgent.mutate(v)} busy={createAgent.isPending} />
          }
        />
        <Section
          title="Base models"
          count={models.length}
          empty="No models yet. Register one."
          items={models.map((m) => ({
            id: m.id,
            primary: m.name,
            secondary: `${m.provider} · ${m.slug}`,
            system: m.is_system,
          }))}
          onDelete={(id) => remove.mutate({ table: "base_models", id })}
          form={
            <ModelForm onSubmit={(v) => createModel.mutate(v)} busy={createModel.isPending} />
          }
        />
      </div>
    </main>
  );
}

function Section(props: {
  title: string;
  count: number;
  empty: string;
  items: { id: string; primary: string; secondary: string; system: boolean }[];
  onDelete: (id: string) => void;
  form: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {props.title}
        </h2>
        <span className="text-xs text-muted-foreground">{props.count}</span>
      </div>
      <div className="mb-4">{props.form}</div>
      {props.items.length === 0 ? (
        <p className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {props.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {props.items.map((it) => (
            <li
              key={it.id}
              className="flex items-start justify-between gap-2 rounded border border-border bg-panel-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{it.primary}</span>
                  {it.system && (
                    <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
                      VDNX
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{it.secondary}</div>
              </div>
              {!it.system && (
                <button
                  onClick={() => props.onDelete(it.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentForm({ onSubmit, busy }: { onSubmit: (v: { name: string; industry: string; description: string }) => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("general");
  const [description, setDescription] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), industry: industry.trim() || "general", description: description.trim() });
    setName(""); setIndustry("general"); setDescription("");
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded border border-border bg-panel-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="ag-name" className="text-[10px] uppercase tracking-wider">Name</Label>
          <Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="ag-ind" className="text-[10px] uppercase tracking-wider">Industry</Label>
          <Input id="ag-ind" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="ag-desc" className="text-[10px] uppercase tracking-wider">Description</Label>
        <Textarea id="ag-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy} size="sm" className="w-full">
        <Plus className="mr-1 h-3.5 w-3.5" /> {busy ? "…" : "Create agent"}
      </Button>
    </form>
  );
}

function ModelForm({ onSubmit, busy }: { onSubmit: (v: { slug: string; name: string; provider: string; description: string }) => void; busy: boolean }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openrouter");
  const [description, setDescription] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !name.trim()) return;
    onSubmit({ slug: slug.trim(), name: name.trim(), provider: provider.trim() || "openrouter", description: description.trim() });
    setSlug(""); setName(""); setProvider("openrouter"); setDescription("");
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded border border-border bg-panel-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="md-name" className="text-[10px] uppercase tracking-wider">Display name</Label>
          <Input id="md-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="md-prov" className="text-[10px] uppercase tracking-wider">Provider</Label>
          <Input id="md-prov" value={provider} onChange={(e) => setProvider(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="md-slug" className="text-[10px] uppercase tracking-wider">Slug</Label>
        <Input id="md-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="vendor/model-id" required />
      </div>
      <div>
        <Label htmlFor="md-desc" className="text-[10px] uppercase tracking-wider">Description</Label>
        <Textarea id="md-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy} size="sm" className="w-full">
        <Plus className="mr-1 h-3.5 w-3.5" /> {busy ? "…" : "Add model"}
      </Button>
    </form>
  );
}
