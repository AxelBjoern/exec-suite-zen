import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCompanyContext,
  saveCompanyContext,
  recallDecisions,
} from "@/serverfns/context.functions";
import { toast } from "sonner";

const FIELDS: { key: keyof Form; label: string; rows: number; placeholder: string }[] = [
  { key: "mission", label: "Mission", rows: 2, placeholder: "VDNX is..." },
  { key: "principles", label: "Principles", rows: 2, placeholder: "Authority. Auditability. Atomicity." },
  { key: "positioning", label: "Positioning", rows: 2, placeholder: "The verifiable execution layer for..." },
  { key: "icp", label: "ICP", rows: 2, placeholder: "Regulated enterprises in..." },
  { key: "current_priorities", label: "Current Priorities", rows: 3, placeholder: "Series A, MENA launch, ..." },
  { key: "notes", label: "Standing Notes", rows: 4, placeholder: "Any rules every agent should know..." },
];

type Form = {
  mission: string;
  principles: string;
  positioning: string;
  icp: string;
  current_priorities: string;
  notes: string;
};

export function ContextPanel() {
  const qc = useQueryClient();
  const getCtx = useServerFn(getCompanyContext);
  const saveCtx = useServerFn(saveCompanyContext);
  const recall = useServerFn(recallDecisions);

  const ctxQ = useQuery({ queryKey: ["company_context"], queryFn: () => getCtx() });
  const decQ = useQuery({ queryKey: ["recent_decisions"], queryFn: () => recall({ data: { limit: 12 } }) });

  const [form, setForm] = useState<Form>({
    mission: "", principles: "", positioning: "", icp: "", current_priorities: "", notes: "",
  });

  useEffect(() => {
    if (ctxQ.data) {
      setForm({
        mission: ctxQ.data.mission ?? "",
        principles: ctxQ.data.principles ?? "",
        positioning: ctxQ.data.positioning ?? "",
        icp: ctxQ.data.icp ?? "",
        current_priorities: ctxQ.data.current_priorities ?? "",
        notes: ctxQ.data.notes ?? "",
      });
    }
  }, [ctxQ.data]);

  const save = useMutation({
    mutationFn: () => saveCtx({ data: form }),
    onSuccess: () => {
      toast.success("Company context saved — every agent now uses this.");
      qc.invalidateQueries({ queryKey: ["company_context"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-lg font-mono uppercase text-primary">Company Context</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Standing facts injected into every agent prompt. Update once — every CEO/CMO/CTO call uses it.
        </p>
      </header>

      <div className="space-y-4 border border-rule rounded bg-panel/40 p-4">
        {FIELDS.map(f => (
          <div key={f.key}>
            <label className="text-[11px] smallcaps text-muted-foreground block mb-1">{f.label}</label>
            <textarea
              rows={f.rows}
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
              className="w-full bg-background border border-rule rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-primary"
            />
          </div>
        ))}
        <div className="flex justify-end">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-4 py-2 text-xs font-mono uppercase bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save Context"}
          </button>
        </div>
      </div>

      <section className="border border-rule rounded bg-panel/40 p-4">
        <h2 className="text-[11px] smallcaps text-muted-foreground mb-3">Recent Decisions (cross-thread recall)</h2>
        {!decQ.data?.length ? (
          <p className="text-xs text-muted-foreground">No decisions logged yet. Run a command to start the log.</p>
        ) : (
          <ul className="space-y-2">
            {decQ.data.map(d => (
              <li key={d.id} className="border-l-2 border-primary/40 pl-3">
                <div className="text-[10px] font-mono text-muted-foreground">
                  {new Date(d.created_at).toLocaleString("en-GB", { hour12: false })} · {d.agent_slug?.toUpperCase() ?? "—"}
                </div>
                <div className="text-sm font-medium text-foreground">{d.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{d.decision}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
