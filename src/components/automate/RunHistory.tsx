import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listRuns, decideRunApproval } from "@/lib/workflows.functions";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-foreground",
  running: "bg-primary/20 text-foreground",
  awaiting_approval: "bg-destructive/20 text-foreground",
  completed: "bg-accent/20 text-foreground",
  failed: "bg-destructive text-destructive-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function RunHistory({ workflowId }: { workflowId?: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRuns);
  const decideFn = useServerFn(decideRunApproval);
  const { data } = useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => listFn({ data: { workflow_id: workflowId, limit: 25 } }),
    refetchInterval: 10_000,
  });

  const decide = useMutation({
    mutationFn: (v: { run_id: string; approve: boolean }) => decideFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved — resuming run" : "Rejected — run cancelled");
      qc.invalidateQueries({ queryKey: ["workflow-runs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = data?.rows ?? [];
  if (!rows.length) return <p className="text-xs text-muted-foreground">No runs yet.</p>;

  return (
    <ul className="space-y-2">
      {rows.map((r: any) => (
        <RunRow key={r.id} run={r} onDecide={(approve) => decide.mutate({ run_id: r.id, approve })} deciding={decide.isPending} />
      ))}
    </ul>
  );
}

function RunRow({ run, onDecide, deciding }: { run: any; onDecide: (approve: boolean) => void; deciding: boolean }) {
  const [open, setOpen] = useState(false);
  const log: any[] = Array.isArray(run.log) ? run.log : [];
  return (
    <li className="rounded-md border border-border bg-panel p-2.5">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Badge className={`text-[10px] ${STATUS_TONE[run.status] ?? "bg-muted"}`}>{run.status}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(run.started_at).toLocaleString()}</span>
        <span className="ml-auto flex items-center gap-1">
          {run.status === "awaiting_approval" && (
            <>
              <Button size="sm" variant="ghost" onClick={() => onDecide(false)} disabled={deciding} className="h-6 px-2 text-[11px] text-destructive">
                <X className="h-3 w-3 mr-1" /> Reject
              </Button>
              <Button size="sm" onClick={() => onDecide(true)} disabled={deciding} className="h-6 px-2 text-[11px]">
                {deciding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />} Approve
              </Button>
            </>
          )}
        </span>
      </div>
      {open && (
        <ol className="mt-2 ml-6 space-y-1 border-l border-border pl-3">
          {log.length === 0 && <li className="text-[11px] text-muted-foreground">No log entries yet.</li>}
          {log.map((entry, i) => (
            <li key={i} className="text-[11px]">
              <span className={`mr-2 ${entry.level === "error" ? "text-destructive" : entry.level === "warn" ? "text-primary" : "text-muted-foreground"}`}>
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span className="text-foreground">{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
