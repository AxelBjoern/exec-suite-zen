import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { ArrowLeft, Plus, Play, Save, Zap, Trash2, FileTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow, runWorkflowNow, toggleWorkflowActive,
  type WorkflowNode,
} from "@/lib/workflows.functions";
import { WORKFLOW_TEMPLATES, NODE_TYPES, NODE_TYPE_LABEL } from "@/lib/workflow-templates";
import { NodeCard } from "@/components/automate/NodeCard";
import { RunHistory } from "@/components/automate/RunHistory";

export const Route = createFileRoute("/_authenticated/automate")({
  head: () => ({ meta: [{ title: "Automate — Workflow Builder" }, { name: "description", content: "Visual builder for AI workflows with sovereignty gates and human approvals." }] }),
  component: AutomatePage,
});

function AutomatePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkflows);
  const getFn = useServerFn(getWorkflow);
  const saveFn = useServerFn(saveWorkflow);
  const delFn = useServerFn(deleteWorkflow);
  const runFn = useServerFn(runWorkflowNow);
  const toggleFn = useServerFn(toggleWorkflowActive);

  const list = useQuery({ queryKey: ["workflows"], queryFn: () => listFn(), staleTime: 30_000 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const current = useQuery({
    queryKey: ["workflow", activeId],
    queryFn: () => activeId ? getFn({ data: { id: activeId } }) : null,
    enabled: !!activeId,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const dragIdx = useRef<number | null>(null);

  // Hydrate form when current changes
  useEffect(() => {
    if (current.data) {
      setName(current.data.name ?? "");
      setDescription(current.data.description ?? "");
      setNodes(Array.isArray(current.data.nodes) ? (current.data.nodes as WorkflowNode[]) : []);
    } else if (!activeId) {
      setName(""); setDescription(""); setNodes([]);
    }
  }, [current.data, activeId]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { id: activeId ?? undefined, name: name || "Untitled workflow", description, nodes } }),
    onSuccess: (row: any) => {
      toast.success("Workflow saved");
      setActiveId(row.id);
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflow", row.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const run = useMutation({
    mutationFn: () => runFn({ data: { id: activeId! } }),
    onSuccess: () => { toast.success("Run started"); qc.invalidateQueries({ queryKey: ["workflow-runs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Run failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { setActiveId(null); qc.invalidateQueries({ queryKey: ["workflows"] }); },
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => toggleFn({ data: { id: activeId!, active } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workflows"] }); qc.invalidateQueries({ queryKey: ["workflow", activeId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Toggle failed"),
  });

  function addNode(type: WorkflowNode["type"]) {
    setNodes((prev) => [...prev, { id: uuidv4(), type, label: NODE_TYPE_LABEL[type], config: {} }]);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    setNodes((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }

  function loadTemplate(slug: string) {
    const t = WORKFLOW_TEMPLATES.find((x) => x.slug === slug);
    if (!t) return;
    setActiveId(null);
    setName(t.name); setDescription(t.description);
    setNodes(t.nodes.map((n) => ({ ...n, id: uuidv4() })));
    toast.info("Template loaded — Save to persist");
  }

  const isActive = !!current.data?.active;

  return (
    <div className="flex h-[calc(100vh-3.25rem)] bg-background">
      <aside className="w-64 shrink-0 border-r border-border bg-panel flex flex-col">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Automate</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setActiveId(null); setName(""); setDescription(""); setNodes([]); }} className="mx-2 mt-2 justify-start text-xs">
          <Plus className="h-3 w-3 mr-1" /> New workflow
        </Button>

        <div className="px-3 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Templates</p>
        </div>
        <div className="px-2 space-y-1">
          {WORKFLOW_TEMPLATES.map((t) => (
            <button key={t.slug} onClick={() => loadTemplate(t.slug)} className="w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-panel-2 text-foreground">
              <FileTemplate className="inline h-3 w-3 mr-1 text-primary" /> {t.name}
            </button>
          ))}
        </div>

        <div className="px-3 pt-4 pb-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saved</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {list.data?.rows.map((w: any) => (
            <div key={w.id} className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-panel-2 ${activeId === w.id ? "bg-panel-2 border border-border" : ""}`}>
              <button onClick={() => setActiveId(w.id)} className="flex-1 text-left truncate text-foreground">
                {w.active && <Zap className="inline h-3 w-3 mr-1 text-primary" />}{w.name}
              </button>
              <button onClick={() => del.mutate(w.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {list.data?.rows.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No workflows yet.</p>}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border p-4 space-y-3 bg-panel/40">
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" className="text-base font-serif font-semibold" />
            <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}><Save className="h-3 w-3 mr-1" /> Save</Button>
            <Button size="sm" variant={isActive ? "secondary" : "outline"} onClick={() => toggle.mutate(!isActive)} disabled={!activeId || toggle.isPending}>
              <Zap className="h-3 w-3 mr-1" /> {isActive ? "Active" : "Activate"}
            </Button>
            <Button size="sm" onClick={() => run.mutate()} disabled={!activeId || run.isPending}><Play className="h-3 w-3 mr-1" /> Run now</Button>
          </div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this workflow do?" rows={1} className="text-xs" />
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-2 border-r border-border">
            <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border mb-3">
              {NODE_TYPES.map((t) => (
                <Button key={t} size="sm" variant="ghost" onClick={() => addNode(t)} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> {NODE_TYPE_LABEL[t]}
                </Button>
              ))}
            </div>
            {nodes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Pick a template or add nodes to begin.</p>
            ) : (
              nodes.map((n, i) => (
                <NodeCard
                  key={n.id} node={n} index={i}
                  onChange={(next) => setNodes((prev) => prev.map((x, j) => j === i ? next : x))}
                  onDelete={() => setNodes((prev) => prev.filter((_, j) => j !== i))}
                  onDragStart={() => { dragIdx.current = i; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIdx.current !== null) reorder(dragIdx.current, i); dragIdx.current = null; }}
                />
              ))
            )}
          </div>

          <aside className="w-[34%] min-w-[320px] overflow-y-auto p-4 bg-panel/30">
            <h3 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Run history</h3>
            <RunHistory workflowId={activeId ?? undefined} />
          </aside>
        </div>
      </section>
    </div>
  );
}
