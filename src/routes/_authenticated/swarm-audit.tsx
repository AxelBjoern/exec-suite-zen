import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSwarmAudit } from "@/serverfns/swarm.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/swarm-audit")({
  head: () => ({
    meta: [
      { title: "Swarm Audit Trail" },
      { name: "description", content: "Review swarm agent runs, timeouts, and fallback decisions." },
    ],
  }),
  component: SwarmAuditPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <p className="text-destructive">Failed to load audit: {error.message}</p>
      <button onClick={reset} className="mt-2 underline">Retry</button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function statusBadge(s: string) {
  if (s === "ok") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> ok</Badge>;
  if (s === "degraded") return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><AlertTriangle className="h-3 w-3" /> degraded</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> failed</Badge>;
}

function SwarmAuditPage() {
  const fetchAudit = useServerFn(listSwarmAudit);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["swarm-audit"],
    queryFn: () => fetchAudit({ data: { limit: 50 } }),
  });

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Swarm Audit Trail</h1>
          <p className="text-sm text-muted-foreground">Agent timeouts, fallback decisions, and per-draft errors for your last 50 swarm runs.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" /> {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (data?.runs.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">No swarm runs yet.</p>
      )}

      <div className="space-y-3">
        {data?.runs.map((r: any) => {
          const fallbackCount = r.drafts.filter((d: any) => d.used_fallback).length;
          const errorCount = r.drafts.filter((d: any) => d.status !== "ok").length;
          const timeouts = r.drafts.filter((d: any) =>
            (d.primary_error ?? "").toLowerCase().includes("timeout") ||
            (d.error ?? "").toLowerCase().includes("timeout")
          ).length;
          return (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {statusBadge(r.status)}
                      <span className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</span>
                    </CardTitle>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(r.created_at)}</span>
                      <span>{r.latency_ms}ms</span>
                      <span>synth: <code>{r.synth_model}</code></span>
                      {r.conversation_id && (
                        <Link
                          to="/chat/$sessionId"
                          params={{ sessionId: r.conversation_id }}
                          className="underline underline-offset-2"
                        >
                          open conversation
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {timeouts > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{timeouts} timeout</Badge>}
                    {fallbackCount > 0 && <Badge variant="outline">{fallbackCount} fallback</Badge>}
                    {errorCount > 0 && <Badge variant="destructive">{errorCount} error</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b">
                        <th className="text-left py-1.5 pr-3">Agent</th>
                        <th className="text-left py-1.5 pr-3">Attempted</th>
                        <th className="text-left py-1.5 pr-3">Final model</th>
                        <th className="text-left py-1.5 pr-3">Status</th>
                        <th className="text-left py-1.5 pr-3">Latency</th>
                        <th className="text-left py-1.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.drafts.map((d: any, i: number) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className="py-1.5 pr-3 font-medium">{d.role_label || d.role || "—"}</td>
                          <td className="py-1.5 pr-3 font-mono">
                            {(d.attempted_models ?? [d.model_slug]).join(" → ")}
                          </td>
                          <td className="py-1.5 pr-3 font-mono">{d.model_slug}</td>
                          <td className="py-1.5 pr-3">
                            {d.status === "ok" ? (
                              d.used_fallback ? (
                                <Badge variant="outline" className="border-amber-500 text-amber-600">ok via fallback</Badge>
                              ) : (
                                <Badge variant="secondary">ok</Badge>
                              )
                            ) : (
                              <Badge variant="destructive">error</Badge>
                            )}
                          </td>
                          <td className="py-1.5 pr-3">{d.latency_ms}ms</td>
                          <td className="py-1.5 text-muted-foreground">
                            {d.primary_error && <div>primary: {d.primary_error}</div>}
                            {d.error && <div>error: {d.error}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
