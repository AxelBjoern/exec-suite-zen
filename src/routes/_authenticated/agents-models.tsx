import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Cpu, FileText, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { isVdnxOwnerEmail } from "@/lib/vdnx";

export const Route = createFileRoute("/_authenticated/agents-models")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agents & Models — VDNX" }] }),
  component: AgentsModelsShell,
});

type AgentType = {
  id: string;
  name: string;
  industry: string;
  description: string;
  is_system: boolean;
  is_public?: boolean;
  owner_id?: string | null;
};
type BaseModel = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string;
  is_system: boolean;
  is_public?: boolean;
  owner_id?: string | null;
  swarm_eligible?: boolean;
};


type AgentDraft = { name: string; industry: string; description: string };
type ModelDraft = { slug: string; name: string; provider: string; description: string };

const agentDraftKey = (uid: string) => `am-wizard-draft-agent:${uid}`;
const modelDraftKey = (uid: string) => `am-wizard-draft-model:${uid}`;
const dismissKey = (uid: string) => `am-wizard-dismissed:${uid}`;
const ALLOWED_KNOWLEDGE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeDraft<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}
function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function AgentsModelsShell() {
  const qc = useQueryClient();
  const agentFormRef = useRef<HTMLDivElement | null>(null);
  const modelFormRef = useRef<HTMLDivElement | null>(null);

  const [agentPrefill, setAgentPrefill] = useState<AgentDraft | null>(null);
  const [modelPrefill, setModelPrefill] = useState<ModelDraft | null>(null);
  const [highlightAgent, setHighlightAgent] = useState(false);
  const [highlightModel, setHighlightModel] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  const { data: me } = useQuery({
    queryKey: ["am", "me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return { id: data.user?.id ?? null, email: data.user?.email ?? null };
    },
    staleTime: Infinity,
  });

  const { data: types = [] } = useQuery<AgentType[]>({
    queryKey: ["am", "agent_types"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agent_types")
        .select("id,name,industry,description,is_system,is_public,owner_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: models = [] } = useQuery<BaseModel[]>({
    queryKey: ["am", "base_models"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("base_models")
        .select("id,slug,name,provider,description,is_system,is_public,owner_id,swarm_eligible")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const isOwner = isVdnxOwnerEmail(me?.email);
  const canManageRow = (row: { owner_id?: string | null; is_system: boolean }) =>
    row.owner_id === me?.id || (isOwner && row.is_system);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!me?.id || hydratedRef.current) return;
    if (isVdnxOwnerEmail(me.email)) return;
    hydratedRef.current = true;
    const a = readDraft<AgentDraft>(agentDraftKey(me.id));
    const m = readDraft<ModelDraft>(modelDraftKey(me.id));
    if (a) setAgentPrefill(a);
    if (m) setModelPrefill(m);
  }, [me?.id, me?.email]);

  const createAgent = useMutation({
    mutationFn: async (vars: AgentDraft) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("agent_types").insert({
        owner_id: u.user.id, is_system: false, ...vars,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agent created");
      if (me?.id) clearDraft(agentDraftKey(me.id));
      qc.invalidateQueries({ queryKey: ["am", "agent_types"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const updateAgent = useMutation({
    mutationFn: async ({ id, vars }: { id: string; vars: AgentDraft }) => {
      const { error } = await (supabase as any).from("agent_types").update(vars).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agent updated");
      qc.invalidateQueries({ queryKey: ["am", "agent_types"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const createModel = useMutation({
    mutationFn: async (vars: ModelDraft) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("base_models").insert({
        owner_id: u.user.id, is_system: false, ...vars,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Model added");
      if (me?.id) clearDraft(modelDraftKey(me.id));
      qc.invalidateQueries({ queryKey: ["am", "base_models"] });
      qc.invalidateQueries({ queryKey: ["my-model-allowlist"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const updateModel = useMutation({
    mutationFn: async ({ id, vars }: { id: string; vars: ModelDraft }) => {
      const { error } = await (supabase as any).from("base_models").update(vars).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Model updated");
      qc.invalidateQueries({ queryKey: ["am", "base_models"] });
      qc.invalidateQueries({ queryKey: ["my-model-allowlist"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const toggleSwarm = useMutation({
    mutationFn: async ({ id, swarm_eligible }: { id: string; swarm_eligible: boolean }) => {
      const { error } = await (supabase as any).from("base_models").update({ swarm_eligible }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["am", "base_models"] });
      qc.invalidateQueries({ queryKey: ["swarm-config"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: "agent_types" | "base_models"; id: string }) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["am", v.table] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  function applyAgentPrefill(v: AgentDraft) {
    setAgentPrefill(v);
    setEditingAgentId(null);
    setHighlightAgent(true);
    if (me?.id) writeDraft(agentDraftKey(me.id), v);
    setTimeout(() => agentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }
  function applyModelPrefill(v: ModelDraft) {
    setModelPrefill(v);
    setEditingModelId(null);
    setHighlightModel(true);
    if (me?.id) writeDraft(modelDraftKey(me.id), v);
    setTimeout(() => modelFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  async function handleEditAgent(row: AgentType) {
    if (!me?.id) return;
    // Clone VDNX/public into owned copy unless this owner can manage the system row directly.
    if (!canManageRow(row)) {
      const draft: AgentDraft = {
        name: `${row.name} (copy)`, industry: row.industry, description: row.description,
      };
      const { data, error } = await (supabase as any)
        .from("agent_types")
        .insert({ owner_id: me.id, is_system: false, ...draft })
        .select("id").single();
      if (error) { toast.error(error.message); return; }
      toast.success("Cloned to your library");
      qc.invalidateQueries({ queryKey: ["am", "agent_types"] });
      setEditingAgentId(data.id);
      setAgentPrefill(draft);
    } else {
      setEditingAgentId(row.id);
      setAgentPrefill({ name: row.name, industry: row.industry, description: row.description });
    }
    setTimeout(() => agentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  async function handleEditModel(row: BaseModel) {
    if (!me?.id) return;
    if (!canManageRow(row)) {
      const draft: ModelDraft = {
        slug: row.slug, name: `${row.name} (copy)`, provider: row.provider, description: row.description,
      };
      const { data, error } = await (supabase as any)
        .from("base_models")
        .insert({ owner_id: me.id, is_system: false, ...draft })
        .select("id").single();
      if (error) { toast.error(error.message); return; }
      toast.success("Cloned to your library");
      qc.invalidateQueries({ queryKey: ["am", "base_models"] });
      setEditingModelId(data.id);
      setModelPrefill(draft);
    } else {
      setEditingModelId(row.id);
      setModelPrefill({ slug: row.slug, name: row.name, provider: row.provider, description: row.description });
    }
    setTimeout(() => modelFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12">
      <Toaster theme="dark" position="top-right" />
      <div className="mb-8 flex items-center gap-3">
        <Cpu className="h-7 w-7 text-primary" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Module</p>
          <h1 className="font-serif text-3xl font-bold text-foreground">Agents &amp; Models</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your models and choose which ones can be used by Swarm agents.
          </p>
        </div>
      </div>

      {me?.id && !isVdnxOwnerEmail(me.email) && (
        <SetupWizard
          userId={me.id}
          hasOwnAgent={types.some((t) => t.owner_id === me.id)}
          hasOwnModel={models.some((m) => m.owner_id === me.id)}
          onPrefillAgent={applyAgentPrefill}
          onPrefillModel={applyModelPrefill}
        />
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div ref={agentFormRef}>
          <Section
            title="Agents"
            count={types.length}
            empty="No agents yet."
            rows={types.map((t) => ({ row: t, isOwn: t.owner_id === me?.id, canManage: canManageRow(t) }))}
            renderRowExtras={(r) =>
              r.canManage && me?.id ? <AgentKnowledge agentId={r.row.id} userId={me.id} /> : null
            }
            describe={(t: AgentType) =>
              `${t.industry}${t.description ? " · " + t.description : ""}`
            }
            primary={(t: AgentType) => t.name}
            onEdit={(t: AgentType) => handleEditAgent(t)}
            onDelete={(t: AgentType) => remove.mutate({ table: "agent_types", id: t.id })}
            form={
              <AgentForm
                key={editingAgentId ?? "new"}
                userId={me?.id ?? null}
                editingId={editingAgentId}
                onCancelEdit={() => { setEditingAgentId(null); setAgentPrefill(null); }}
                onSubmit={(v) => {
                  if (editingAgentId) {
                    updateAgent.mutate({ id: editingAgentId, vars: v });
                    setEditingAgentId(null);
                  } else {
                    createAgent.mutate(v);
                  }
                  setAgentPrefill(null);
                  setHighlightAgent(false);
                }}
                busy={createAgent.isPending || updateAgent.isPending}
                prefill={agentPrefill ?? undefined}
                highlightRequired={highlightAgent}
                onHighlightConsumed={() => setHighlightAgent(false)}
              />
            }
          />
        </div>
        <div ref={modelFormRef}>
          <Section
            title="Models"
            count={models.length}
            empty="No models yet."
            rows={models.map((m) => ({ row: m, isOwn: m.owner_id === me?.id, canManage: canManageRow(m) }))}
            describe={(m: BaseModel) => `${m.provider} · ${m.slug}`}
            primary={(m: BaseModel) => m.name}
            onEdit={(m: BaseModel) => handleEditModel(m)}
            onDelete={(m: BaseModel) => remove.mutate({ table: "base_models", id: m.id })}
            renderRowExtras={({ row, canManage }) => (
              <div className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <label className={`inline-flex items-center gap-1.5 ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`} title={canManage ? "Available in Swarm picker" : "Clone to change"}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-primary"
                    checked={!!row.swarm_eligible}
                    disabled={!canManage || toggleSwarm.isPending}
                    onChange={(e) => toggleSwarm.mutate({ id: row.id, swarm_eligible: e.target.checked })}
                  />
                  Swarm
                </label>
              </div>
            )}
            form={
              <ModelForm
                key={editingModelId ?? "new"}
                userId={me?.id ?? null}
                editingId={editingModelId}
                onCancelEdit={() => { setEditingModelId(null); setModelPrefill(null); }}
                onSubmit={(v) => {
                  if (editingModelId) {
                    updateModel.mutate({ id: editingModelId, vars: v });
                    setEditingModelId(null);
                  } else {
                    createModel.mutate(v);
                  }
                  setModelPrefill(null);
                  setHighlightModel(false);
                }}
                busy={createModel.isPending || updateModel.isPending}
                prefill={modelPrefill ?? undefined}
                highlightRequired={highlightModel}
                onHighlightConsumed={() => setHighlightModel(false)}
              />
            }
          />
        </div>
      </div>
    </main>
  );
}

function Section<T extends { id: string; is_system: boolean; is_public?: boolean }>(props: {
  title: string;
  count: number;
  empty: string;
  rows: { row: T; isOwn: boolean; canManage?: boolean }[];
  primary: (row: T) => string;
  describe: (row: T) => string;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  renderRowExtras?: (r: { row: T; isOwn: boolean; canManage: boolean }) => React.ReactNode;
  form: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{props.title}</h2>
        <span className="text-xs text-muted-foreground">{props.count}</span>
      </div>
      <div className="mb-4">{props.form}</div>
      {props.rows.length === 0 ? (
        <p className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {props.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {props.rows.map(({ row, isOwn, canManage = isOwn }) => (
            <li key={row.id} className="rounded border border-border bg-panel-2 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{props.primary(row)}</span>
                    {row.is_system && (
                      <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">VDNX</span>
                    )}
                    {!row.is_system && row.is_public && (
                      <span className="rounded-full border border-muted-foreground/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Default</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{props.describe(row)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => props.onEdit(row)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={canManage ? "Edit" : "Clone & edit"}
                    title={canManage ? "Edit" : "Clone & edit"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {canManage && (
                    <button
                      onClick={() => props.onDelete(row)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {props.renderRowExtras?.({ row, isOwn, canManage })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentForm({
  userId, editingId, onCancelEdit, onSubmit, busy, prefill, highlightRequired, onHighlightConsumed,
}: {
  userId: string | null;
  editingId: string | null;
  onCancelEdit: () => void;
  onSubmit: (v: AgentDraft) => void;
  busy: boolean;
  prefill?: AgentDraft;
  highlightRequired?: boolean;
  onHighlightConsumed?: () => void;
}) {
  const [name, setName] = useState(prefill?.name ?? "");
  const [industry, setIndustry] = useState(prefill?.industry ?? "general");
  const [description, setDescription] = useState(prefill?.description ?? "");

  useEffect(() => {
    if (prefill) { setName(prefill.name); setIndustry(prefill.industry); setDescription(prefill.description); }
  }, [prefill]);

  useEffect(() => {
    if (!userId || editingId) return;
    if (!name && !description && industry === "general") return;
    writeDraft(agentDraftKey(userId), { name, industry, description });
  }, [userId, editingId, name, industry, description]);

  useEffect(() => {
    if (!highlightRequired) return;
    const t = setTimeout(() => onHighlightConsumed?.(), 3000);
    return () => clearTimeout(t);
  }, [highlightRequired, onHighlightConsumed]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), industry: industry.trim() || "general", description: description.trim() });
  }
  const reqRing = highlightRequired ? "ring-2 ring-primary/60 border-primary" : "";
  return (
    <form onSubmit={submit} className="space-y-2 rounded border border-border bg-panel-2 p-3">
      {editingId && (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-primary">
          Editing
          <button type="button" onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="ag-name" className="text-[10px] uppercase tracking-wider">Name</Label>
          <Input id="ag-name" value={name} onChange={(e) => { setName(e.target.value); onHighlightConsumed?.(); }} required className={reqRing} />
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
        <Plus className="mr-1 h-3.5 w-3.5" /> {busy ? "…" : editingId ? "Save changes" : "Create agent"}
      </Button>
    </form>
  );
}

function ModelForm({
  userId, editingId, onCancelEdit, onSubmit, busy, prefill, highlightRequired, onHighlightConsumed,
}: {
  userId: string | null;
  editingId: string | null;
  onCancelEdit: () => void;
  onSubmit: (v: ModelDraft) => void;
  busy: boolean;
  prefill?: ModelDraft;
  highlightRequired?: boolean;
  onHighlightConsumed?: () => void;
}) {
  const [slug, setSlug] = useState(prefill?.slug ?? "");
  const [name, setName] = useState(prefill?.name ?? "");
  const [provider, setProvider] = useState(prefill?.provider ?? "openrouter");
  const [description, setDescription] = useState(prefill?.description ?? "");

  useEffect(() => {
    if (prefill) { setSlug(prefill.slug); setName(prefill.name); setProvider(prefill.provider); setDescription(prefill.description); }
  }, [prefill]);

  useEffect(() => {
    if (!userId || editingId) return;
    if (!slug && !name && !description && provider === "openrouter") return;
    writeDraft(modelDraftKey(userId), { slug, name, provider, description });
  }, [userId, editingId, slug, name, provider, description]);

  useEffect(() => {
    if (!highlightRequired) return;
    const t = setTimeout(() => onHighlightConsumed?.(), 3000);
    return () => clearTimeout(t);
  }, [highlightRequired, onHighlightConsumed]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !name.trim()) return;
    onSubmit({ slug: slug.trim(), name: name.trim(), provider: provider.trim() || "openrouter", description: description.trim() });
  }
  const reqRing = highlightRequired ? "ring-2 ring-primary/60 border-primary" : "";
  return (
    <form onSubmit={submit} className="space-y-2 rounded border border-border bg-panel-2 p-3">
      {editingId && (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-primary">
          Editing
          <button type="button" onClick={onCancelEdit} className="text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="md-name" className="text-[10px] uppercase tracking-wider">Display name</Label>
          <Input id="md-name" value={name} onChange={(e) => { setName(e.target.value); onHighlightConsumed?.(); }} required className={reqRing} />
        </div>
        <div>
          <Label htmlFor="md-prov" className="text-[10px] uppercase tracking-wider">Provider</Label>
          <Input id="md-prov" value={provider} onChange={(e) => setProvider(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="md-slug" className="text-[10px] uppercase tracking-wider">Slug</Label>
        <Input id="md-slug" value={slug} onChange={(e) => { setSlug(e.target.value); onHighlightConsumed?.(); }} placeholder="vendor/model-id" required className={reqRing} />
      </div>
      <div>
        <Label htmlFor="md-desc" className="text-[10px] uppercase tracking-wider">Description</Label>
        <Textarea id="md-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy} size="sm" className="w-full">
        <Plus className="mr-1 h-3.5 w-3.5" /> {busy ? "…" : editingId ? "Save changes" : "Add model"}
      </Button>
    </form>
  );
}

type KnowledgeFile = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
};

function AgentKnowledge({ agentId, userId }: { agentId: string; userId: string }) {
  const qc = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: files = [] } = useQuery<KnowledgeFile[]>({
    queryKey: ["am", "agent_knowledge", agentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agent_knowledge")
        .select("id,file_name,mime_type,file_size,storage_path")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => ALLOWED_KNOWLEDGE_TYPES.includes(f.type) || /\.(pdf|docx)$/i.test(f.name));
    if (arr.length === 0) {
      toast.error("Only .pdf and .docx files are accepted");
      return;
    }
    setUploading(true);
    try {
      for (const file of arr) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${userId}/${agentId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("agent-knowledge")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await (supabase as any).from("agent_knowledge").insert({
          agent_id: agentId,
          owner_id: userId,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          storage_path: path,
        });
        if (insErr) {
          await supabase.storage.from("agent-knowledge").remove([path]);
          throw insErr;
        }
      }
      toast.success(`${arr.length} file${arr.length > 1 ? "s" : ""} added`);
      qc.invalidateQueries({ queryKey: ["am", "agent_knowledge", agentId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(f: KnowledgeFile) {
    const { error: delErr } = await (supabase as any).from("agent_knowledge").delete().eq("id", f.id);
    if (delErr) { toast.error(delErr.message); return; }
    await supabase.storage.from("agent-knowledge").remove([f.storage_path]);
    qc.invalidateQueries({ queryKey: ["am", "agent_knowledge", agentId] });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        className={`flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed px-3 py-2 text-[11px] transition-colors ${
          dragOver ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
        }`}
      >
        <Upload className="h-3.5 w-3.5" />
        {uploading ? "Uploading…" : dragOver ? "Drop to attach" : "Drag & drop .pdf or .docx (or click)"}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => { if (e.target.files) { handleFiles(e.target.files); e.target.value = ""; } }}
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded bg-panel px-2 py-1 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{f.file_name}</span>
                <span className="shrink-0 text-muted-foreground">{(f.file_size / 1024).toFixed(0)} KB</span>
              </span>
              <button
                onClick={() => removeFile(f)}
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AGENT_PRESETS: AgentDraft[] = [
  { name: "Strategist", industry: "executive", description: "High-level planning, prioritization, and decision framing." },
  { name: "Operator", industry: "operations", description: "Turns plans into concrete tasks, owners, and deadlines." },
  { name: "Researcher", industry: "research", description: "Gathers, summarizes, and cites sources for any topic." },
];

const MODEL_PRESETS: ModelDraft[] = [
  { slug: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "openrouter", description: "Fast, cheap default for most work." },
  { slug: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "openrouter", description: "Balanced multimodal + reasoning." },
];

function SetupWizard(props: {
  userId: string;
  hasOwnAgent: boolean;
  hasOwnModel: boolean;
  onPrefillAgent: (v: AgentDraft) => void;
  onPrefillModel: (v: ModelDraft) => void;
}) {
  const storageKey = dismissKey(props.userId);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });

  useEffect(() => {
    if (props.hasOwnAgent && props.hasOwnModel) {
      window.localStorage.setItem(storageKey, "1");
    }
  }, [props.hasOwnAgent, props.hasOwnModel, storageKey]);

  const autoAdvancedRef = useRef(false);
  const prevHasAgentRef = useRef(props.hasOwnAgent);
  useEffect(() => {
    const prev = prevHasAgentRef.current;
    prevHasAgentRef.current = props.hasOwnAgent;
    if (autoAdvancedRef.current) return;
    if (!prev && props.hasOwnAgent && !props.hasOwnModel) {
      autoAdvancedRef.current = true;
      props.onPrefillModel(MODEL_PRESETS[0]);
    }
  }, [props.hasOwnAgent, props.hasOwnModel, props]);

  if (dismissed || (props.hasOwnAgent && props.hasOwnModel)) return null;

  const step = !props.hasOwnAgent ? 1 : 2;

  function dismiss() {
    window.localStorage.setItem(storageKey, "1");
    clearDraft(agentDraftKey(props.userId));
    clearDraft(modelDraftKey(props.userId));
    setDismissed(true);
  }

  return (
    <section className="mb-8 rounded-lg border border-primary/30 bg-primary/5 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary">Setup · Step {step} of 2</p>
            <h2 className="mt-1 font-serif text-lg font-semibold text-foreground">
              {step === 1 ? "Create your first agent" : "Add a model to power your agents"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {step === 1
                ? "Agents define a role and tone. Pick a preset to prefill the form below — edit before creating."
                : "Models are the LLMs behind your agents. We prefilled DeepSeek V4 Flash — edit or pick another, then add."}
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss setup">
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === 1 ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {AGENT_PRESETS.map((p) => (
            <li key={p.name} className="flex flex-col gap-2 rounded border border-border bg-panel p-3">
              <div>
                <div className="text-sm font-medium text-foreground">{p.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{p.description}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => props.onPrefillAgent(p)}>
                <Plus className="mr-1 h-3.5 w-3.5" />Use preset
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {MODEL_PRESETS.map((p, i) => (
            <li key={p.slug} className="flex flex-col gap-2 rounded border border-border bg-panel p-3">
              <div>
                <div className="text-sm font-medium text-foreground">{p.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{p.provider} · {p.slug}</div>
              </div>
              <Button size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => props.onPrefillModel(p)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {i === 0 ? "Use preset (recommended)" : "Use preset"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Check className={`h-3.5 w-3.5 ${props.hasOwnAgent ? "text-primary" : "opacity-30"}`} />
        Agent
        <Check className={`h-3.5 w-3.5 ${props.hasOwnModel ? "text-primary" : "opacity-30"}`} />
        Model
      </div>
    </section>
  );
}
