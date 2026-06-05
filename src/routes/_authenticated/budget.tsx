import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/budget")({
  ssr: false,
  head: () => ({ meta: [{ title: "Budget — VDNX" }] }),
  component: BudgetShell,
});

type Scenario = {
  id: string;
  name: string;
  is_system: boolean;
  is_base: boolean;
  is_locked: boolean;
  updated_at: string;
};

function BudgetShell() {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data: scenarios = [] } = useQuery<Scenario[]>({
    queryKey: ["budget", "scenarios"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("budget_scenarios")
        .select("id,name,is_system,is_base,is_locked,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (n: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("budget_scenarios").insert({
        owner_id: u.user.id,
        is_system: false,
        name: n,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Board created");
      setName("");
      qc.invalidateQueries({ queryKey: ["budget", "scenarios"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("budget_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget", "scenarios"] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(name.trim());
  }

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12">
      <Toaster theme="dark" position="top-right" />
      <div className="mb-8 flex items-center gap-3">
        <LineChart className="h-7 w-7 text-primary" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Module</p>
          <h1 className="font-serif text-3xl font-bold text-foreground">Budget</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your private boards. The VDNX baseline stays admin-only.
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mb-6 flex items-end gap-2 rounded-lg border border-border bg-panel p-4"
      >
        <div className="flex-1">
          <Label htmlFor="board-name" className="text-[10px] uppercase tracking-wider">
            New board
          </Label>
          <Input
            id="board-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q1 plan"
            required
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          <Plus className="mr-1 h-4 w-4" /> {create.isPending ? "…" : "Create"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-panel">
        {scenarios.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No boards yet. Create your first one above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {scenarios.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{s.name}</span>
                    {s.is_system && (
                      <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
                        VDNX
                      </span>
                    )}
                    {s.is_base && (
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Base
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(s.updated_at).toLocaleString()}
                  </div>
                </div>
                {!s.is_system && (
                  <button
                    onClick={() => remove.mutate(s.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Full editor (scenarios, P&amp;L, sensitivity) ports in the next wave.
      </p>
    </main>
  );
}
