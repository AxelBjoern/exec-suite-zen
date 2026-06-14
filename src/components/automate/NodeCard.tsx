import { useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { WorkflowNode } from "@/lib/workflows.functions";
import { ALLOWED_CHAT_MODELS, NODE_TYPE_LABEL } from "@/lib/workflow-templates";

type Props = {
  node: WorkflowNode;
  index: number;
  onChange: (next: WorkflowNode) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
};

const TYPE_TONE: Record<WorkflowNode["type"], string> = {
  trigger: "bg-primary/15 text-foreground border-primary/40",
  llm_step: "bg-accent/15 text-foreground border-accent/40",
  human_review: "bg-destructive/15 text-foreground border-destructive/40",
  action: "bg-muted text-foreground border-border",
  output: "bg-panel-2 text-foreground border-border",
};

export function NodeCard({ node, index, onChange, onDelete, onDragStart, onDragOver, onDrop }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      className={`rounded-md border ${TYPE_TONE[node.type]} bg-panel p-3`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        <span className="text-[10px] font-bold text-muted-foreground">{index + 1}</span>
        <Badge variant="outline" className="text-[10px]">{NODE_TYPE_LABEL[node.type]}</Badge>
        <Input
          value={node.label}
          onChange={(e) => onChange({ ...node, label: e.target.value })}
          className="h-7 flex-1 text-sm border-0 bg-transparent focus-visible:ring-1"
        />
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
          {open ? "Hide" : "Config"}
        </button>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label="Delete node">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {node.type === "human_review" && (
        <p className="mt-2 text-[11px] text-muted-foreground">🛡️ Sovereignty gate — run pauses for approval here.</p>
      )}

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {node.type === "trigger" && (
            <ConfigField label="Cron">
              <Input value={node.config?.cron ?? ""} onChange={(e) => onChange({ ...node, config: { ...node.config, cron: e.target.value } })} placeholder="0 9 * * *" className="h-8 text-xs font-mono" />
            </ConfigField>
          )}
          {node.type === "llm_step" && (
            <>
              <ConfigField label="Prompt">
                <Textarea rows={3} value={node.config?.prompt ?? ""} onChange={(e) => onChange({ ...node, config: { ...node.config, prompt: e.target.value } })} className="text-xs" />
              </ConfigField>
              <ConfigField label="Model">
                <Select value={node.config?.model ?? "grok"} onValueChange={(v) => onChange({ ...node, config: { ...node.config, model: v } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOWED_CHAT_MODELS.map((m) => <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </ConfigField>
            </>
          )}
          {node.type === "action" && (
            <>
              <ConfigField label="Action">
                <Select value={node.config?.action ?? "email"} onValueChange={(v) => onChange({ ...node, config: { ...node.config, action: v } })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email" className="text-xs">Send email</SelectItem>
                    <SelectItem value="linkedin_post" className="text-xs">LinkedIn post</SelectItem>
                    <SelectItem value="reminder" className="text-xs">Self-reminder</SelectItem>
                  </SelectContent>
                </Select>
              </ConfigField>
              <ConfigField label="Notes">
                <Input value={node.config?.notes ?? ""} onChange={(e) => onChange({ ...node, config: { ...node.config, notes: e.target.value } })} className="h-8 text-xs" />
              </ConfigField>
            </>
          )}
          {node.type === "output" && (
            <ConfigField label="Summary">
              <Input value={node.config?.summary ?? ""} onChange={(e) => onChange({ ...node, config: { ...node.config, summary: e.target.value } })} className="h-8 text-xs" />
            </ConfigField>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
