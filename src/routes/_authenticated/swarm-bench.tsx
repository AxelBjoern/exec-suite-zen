import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { VdnxLoader } from "@/components/VdnxLoader";
import { Trash2, Play, Trophy, Timer, Coins, Star, FileJson, FileText } from "lucide-react";
import jsPDF from "jspdf";
import {
  runSwarmBench,
  listSwarmBenchRuns,
  deleteSwarmBenchRun,
  getSwarmBenchRun,
} from "@/serverfns/swarm-bench.functions";
import { getSwarmConfig } from "@/serverfns/swarm.functions";

export const Route = createFileRoute("/_authenticated/swarm-bench")({
  ssr: false,
  head: () => ({ meta: [{ title: "Swarm Benchmark — VDNX" }] }),
  component: SwarmBenchPage,
});

type BenchRow = {
  id: string;
  label: string | null;
  prompt: string;
  drafter_models: string[];
  synth_model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_credits: number;
  quality_score: number | null;
  per_model: Array<{
    model: string;
    label: string;
    status: string;
    latency_ms: number;
    tokens_in: number;
    tokens_out: number;
    cost_credits: number;
    quality_score: number | null;
    error: string | null;
  }>;
  created_at: string;
};

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
function fmtCost(c: number) {
  return c === 0 ? "—" : `${c.toFixed(3)} cr`;
}

function SwarmBenchPage() {
  const qc = useQueryClient();
  const runBench = useServerFn(runSwarmBench);
  const listRuns = useServerFn(listSwarmBenchRuns);
  const delRun = useServerFn(deleteSwarmBenchRun);
  const loadCfg = useServerFn(getSwarmConfig);

  const { data: cfg } = useQuery({ queryKey: ["swarm-config"], queryFn: () => loadCfg() });
  const { data: runs = [], isLoading } = useQuery<BenchRow[]>({
    queryKey: ["swarm-bench-runs"],
    queryFn: () => listRuns() as any,
  });

  const [prompt, setPrompt] = useState("");
  const [label, setLabel] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runM = useMutation({
    mutationFn: async () => runBench({ data: { prompt, label } }),
    onSuccess: () => {
      toast.success("Benchmark complete");
      setPrompt("");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["swarm-bench-runs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Benchmark failed"),
  });
  const delM = useMutation({
    mutationFn: async (id: string) => delRun({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["swarm-bench-runs"] }),
  });

  const best = useMemo(() => {
    if (!runs.length) return null;
    return [...runs].sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))[0];
  }, [runs]);
  const fastest = useMemo(() => {
    if (!runs.length) return null;
    return [...runs].sort((a, b) => a.latency_ms - b.latency_ms)[0];
  }, [runs]);
  const cheapest = useMemo(() => {
    if (!runs.length) return null;
    return [...runs].sort((a, b) => a.cost_credits - b.cost_credits)[0];
  }, [runs]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-6">
      <Toaster />
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Swarm Benchmark</h1>
          <p className="text-sm text-muted-foreground">
            Runs the same prompt through each drafter + your current swarm config,
            scores results with the synthesizer as arbiter, and stores latency,
            token, and cost estimates for comparison.
          </p>
        </div>
        {cfg && (
          <div className="text-xs text-muted-foreground text-right">
            <div>Synth: <span className="font-mono">{cfg.synthModel}</span></div>
            <div>Cap: {cfg.maxParallel}</div>
          </div>
        )}
      </header>

      <section className="rounded-lg border p-4 space-y-3">
        <Input
          placeholder="Optional label (e.g. 'baseline v2', 'no-SEO agent')"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Textarea
          placeholder="Benchmark prompt…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <div className="flex justify-end">
          <Button
            onClick={() => runM.mutate()}
            disabled={runM.isPending || !prompt.trim()}
            className="gap-2"
          >
            {runM.isPending ? <VdnxLoader className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            Run benchmark
          </Button>
        </div>
      </section>

      {runs.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={<Trophy className="h-4 w-4" />} label="Best quality"
            value={best?.quality_score != null ? `${best.quality_score.toFixed(1)} / 5` : "—"}
            sub={best?.label || best?.prompt.slice(0, 40)} />
          <StatCard icon={<Timer className="h-4 w-4" />} label="Fastest"
            value={fastest ? fmtMs(fastest.latency_ms) : "—"}
            sub={fastest?.label || fastest?.prompt.slice(0, 40)} />
          <StatCard icon={<Coins className="h-4 w-4" />} label="Cheapest"
            value={cheapest ? fmtCost(cheapest.cost_credits) : "—"}
            sub={cheapest?.label || cheapest?.prompt.slice(0, 40)} />
        </section>
      )}

      <section className="rounded-lg border">
        <div className="border-b px-4 py-2 text-sm font-medium">
          Runs {runs.length ? `(${runs.length})` : ""}
        </div>
        {isLoading ? (
          <div className="p-8 flex justify-center"><VdnxLoader /></div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No benchmarks yet. Run one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Label / prompt</th>
                  <th className="text-left px-3 py-2">Drafters</th>
                  <th className="text-right px-3 py-2"><Timer className="inline h-3 w-3" /> Latency</th>
                  <th className="text-right px-3 py-2"><Coins className="inline h-3 w-3" /> Cost</th>
                  <th className="text-right px-3 py-2"><Star className="inline h-3 w-3" /> Quality</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isBest = best?.id === r.id;
                  const isFast = fastest?.id === r.id;
                  const isCheap = cheapest?.id === r.id;
                  return (
                    <>
                      <tr
                        key={r.id}
                        className="border-t cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 max-w-[280px]">
                          <div className="font-medium truncate">
                            {r.label || r.prompt.slice(0, 60)}
                          </div>
                          {r.label && (
                            <div className="text-xs text-muted-foreground truncate">
                              {r.prompt.slice(0, 80)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.drafter_models.length} models
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmtMs(r.latency_ms)}
                          {isFast && <Badge variant="secondary" className="ml-1 text-[10px]">fast</Badge>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmtCost(r.cost_credits)}
                          {isCheap && <Badge variant="secondary" className="ml-1 text-[10px]">cheap</Badge>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {r.quality_score != null ? r.quality_score.toFixed(1) : "—"}
                          {isBest && <Badge className="ml-1 text-[10px]">best</Badge>}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              delM.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                      {expandedId === r.id && (
                        <tr key={r.id + "-detail"} className="border-t bg-muted/20">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-xs text-muted-foreground mb-2">Prompt</div>
                            <div className="mb-3 whitespace-pre-wrap text-sm">{r.prompt}</div>
                            <div className="text-xs text-muted-foreground mb-2">Per-model breakdown</div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                  <tr>
                                    <th className="text-left px-2 py-1">Model</th>
                                    <th className="text-left px-2 py-1">Status</th>
                                    <th className="text-right px-2 py-1">Latency</th>
                                    <th className="text-right px-2 py-1">Tokens (in/out)</th>
                                    <th className="text-right px-2 py-1">Cost</th>
                                    <th className="text-right px-2 py-1">Score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.per_model.map((m, i) => (
                                    <tr key={i} className="border-t border-border/50">
                                      <td className="px-2 py-1">{m.label}</td>
                                      <td className="px-2 py-1">
                                        {m.status === "ok"
                                          ? <span className="text-green-600">ok</span>
                                          : <span className="text-red-600" title={m.error ?? ""}>error</span>}
                                      </td>
                                      <td className="px-2 py-1 text-right font-mono">{fmtMs(m.latency_ms)}</td>
                                      <td className="px-2 py-1 text-right font-mono">{m.tokens_in}/{m.tokens_out}</td>
                                      <td className="px-2 py-1 text-right font-mono">{fmtCost(m.cost_credits)}</td>
                                      <td className="px-2 py-1 text-right font-mono">
                                        {m.quality_score != null ? m.quality_score.toFixed(1) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
