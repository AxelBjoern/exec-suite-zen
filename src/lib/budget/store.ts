// Supabase-backed budget store.
// - Scenarios live in `public.budget_scenarios` (RLS scoped by owner_id + is_system).
// - Mutations are applied in-memory immediately, then debounced 600 ms and persisted.
// - UI-only state (active id, selected year, density, compare set, audit log) is
//   persisted under localStorage["budget-ui-v1"]. Audit log is local-only.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "@/integrations/supabase/client";
import type { ActualMonth, Assumptions, Scenario } from "./types";
import { SEED_ASSUMPTIONS } from "./seed";

export interface AuditEntry {
  ts: number;
  scenarioId: string;
  scenarioName: string;
  field: string;
  summary: string;
}

interface UiState {
  activeScenarioId: string | null;
  selectedYear: number;
  density: "compact" | "comfortable";
  compareScenarios: string[];
  auditLog: AuditEntry[];
}

export const useBudgetUi = create<
  UiState & {
    setActiveScenario: (id: string) => void;
    setSelectedYear: (y: number) => void;
    setDensity: (d: "compact" | "comfortable") => void;
    setCompareScenarios: (ids: string[]) => void;
    pushAudit: (e: AuditEntry) => void;
    clearAudit: () => void;
  }
>()(
  persist(
    (set) => ({
      activeScenarioId: null,
      selectedYear: new Date().getFullYear(),
      density: "compact",
      compareScenarios: [],
      auditLog: [],
      setActiveScenario: (id) => set({ activeScenarioId: id }),
      setSelectedYear: (selectedYear) => set({ selectedYear }),
      setDensity: (density) => set({ density }),
      setCompareScenarios: (ids) => set({ compareScenarios: ids.slice(0, 4) }),
      pushAudit: (e) =>
        set((s) => ({ auditLog: [e, ...s.auditLog].slice(0, 200) })),
      clearAudit: () => set({ auditLog: [] }),
    }),
    {
      name: "budget-ui-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

interface RemoteRow {
  id: string;
  owner_id: string | null;
  is_system: boolean;
  is_base: boolean;
  is_locked: boolean;
  name: string;
  assumptions: Assumptions | null;
  actuals: { rows: ActualMonth[] } | null;
  contract_start_date: string | null;
  created_at: string;
  updated_at: string;
}

const LEGACY_YEAR_KEYS = [
  "kwhPerCustomerYear", "pricePerKwh", "costPerKwh", "certificateCostPerKwh",
  "priceAreaShare", "priceAreaPricing", "useAreaPricing", "streams",
] as const;

/** Strip legacy energy-model fields from stored scenarios and fill new defaults. */
function migrateAssumptions(a: unknown): Assumptions {
  const base = structuredClone(SEED_ASSUMPTIONS);
  if (!a || typeof a !== "object") return base;
  const src = structuredClone(a) as Record<string, unknown>;
  const years = Array.isArray(src.perYear) ? (src.perYear as Record<string, unknown>[]) : [];
  src.perYear = years.map((y) => {
    const next = { ...y };
    for (const k of LEGACY_YEAR_KEYS) delete next[k];
    if (typeof next.cogsPct !== "number") next.cogsPct = 0;
    return next;
  });
  return src as unknown as Assumptions;
}


function rowToScenario(r: RemoteRow): Scenario {
  return {
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at).getTime(),
    assumptions: migrateAssumptions(r.assumptions),
    actuals: r.actuals ?? { rows: [] },
    contractStartDate: r.contract_start_date ?? undefined,
    isSystem: r.is_system,
    isBase: r.is_base,
    isLocked: r.is_locked || r.is_system,
  };
}


interface RemoteState {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  scenarios: Scenario[];
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  addScenario: (name: string, from?: string) => Promise<Scenario | null>;
  duplicateScenario: (id: string) => Promise<Scenario | null>;
  renameScenario: (id: string, name: string) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  toggleLock: (id: string) => Promise<void>;
  setBaseScenario: (id: string) => Promise<void>;
  updateAssumptions: (id: string, patch: Partial<Assumptions>) => void;
  updateYear: (id: string, yearIndex: number, patch: Partial<Assumptions["perYear"][number]>) => void;
  setActual: (id: string, year: number, month: number, patch: Partial<ActualMonth>) => void;
  clearActuals: (id: string, year?: number) => void;
  setContractStartDate: (id: string, date: string | undefined) => Promise<void>;
  resetActive: (id: string) => void;
  /** force-flush any pending debounced writes (e.g. before navigation/unload). */
  flush: () => Promise<void>;
  /** subscribe to realtime updates on budget_scenarios; returns an unsubscribe fn. */
  subscribeRealtime: () => () => void;
}

// Per-scenario debounced flush registry.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPayload = new Map<string, { assumptions?: Assumptions; actuals?: { rows: ActualMonth[] } }>();

async function flushScenario(id: string) {
  const t = pendingTimers.get(id);
  if (t) clearTimeout(t);
  pendingTimers.delete(id);
  const patch = pendingPayload.get(id);
  if (!patch) return;
  pendingPayload.delete(id);
  await (supabase as any)
    .from("budget_scenarios")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

function queueWrite(id: string, patch: { assumptions?: Assumptions; actuals?: { rows: ActualMonth[] } }) {
  const prev = pendingPayload.get(id) ?? {};
  pendingPayload.set(id, { ...prev, ...patch });
  const existing = pendingTimers.get(id);
  if (existing) clearTimeout(existing);
  pendingTimers.set(id, setTimeout(() => void flushScenario(id), 600));
}

function logAudit(s: Scenario, field: string, summary: string) {
  useBudgetUi.getState().pushAudit({
    ts: Date.now(),
    scenarioId: s.id,
    scenarioName: s.name,
    field,
    summary,
  });
}

export const useBudgetStore = create<RemoteState>()((set, get) => ({
  loading: false,
  loaded: false,
  error: null,
  scenarios: [],

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });
    const { data, error } = await (supabase as any)
      .from("budget_scenarios")
      .select("*")
      .order("is_system", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    const scenarios: Scenario[] = ((data ?? []) as RemoteRow[]).map(rowToScenario);
    set({ loading: false, loaded: true, scenarios });
    // Ensure UI has an active selection.
    const ui = useBudgetUi.getState();
    if (!ui.activeScenarioId || !scenarios.find((s) => s.id === ui.activeScenarioId)) {
      const first = scenarios.find((s) => !s.isSystem) ?? scenarios[0];
      if (first) ui.setActiveScenario(first.id);
    }
  },

  refresh: async () => {
    set({ loaded: false });
    await get().load();
  },

  addScenario: async (name, from) => {
    const src = from ? get().scenarios.find((s) => s.id === from) : undefined;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    const { data, error } = await (supabase as any)
      .from("budget_scenarios")
      .insert({
        owner_id: u.user.id,
        is_system: false,
        is_base: false,
        is_locked: false,
        name,
        assumptions: src?.assumptions ?? structuredClone(SEED_ASSUMPTIONS),
        actuals: { rows: [] },
      })
      .select("*")
      .single();
    if (error) throw error;
    const sc = rowToScenario(data as RemoteRow);
    set((s) => ({ scenarios: [sc, ...s.scenarios] }));
    useBudgetUi.getState().setActiveScenario(sc.id);
    logAudit(sc, "scenario", `Created "${name}"`);
    return sc;
  },

  duplicateScenario: async (id) => {
    const src = get().scenarios.find((s) => s.id === id);
    if (!src) return null;
    return get().addScenario(`${src.name} copy`, src.id);
  },

  renameScenario: async (id, name) => {
    const { error } = await (supabase as any)
      .from("budget_scenarios")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      scenarios: s.scenarios.map((sc) => (sc.id === id ? { ...sc, name } : sc)),
    }));
    const sc = get().scenarios.find((s) => s.id === id);
    if (sc) logAudit(sc, "name", `Renamed to "${name}"`);
  },

  deleteScenario: async (id) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (sc?.isSystem) throw new Error("Cannot delete system scenario");
    const { error } = await (supabase as any)
      .from("budget_scenarios")
      .delete()
      .eq("id", id);
    if (error) throw error;
    set((s) => ({ scenarios: s.scenarios.filter((sc) => sc.id !== id) }));
    const ui = useBudgetUi.getState();
    if (ui.activeScenarioId === id) {
      const next = get().scenarios[0];
      if (next) ui.setActiveScenario(next.id);
    }
  },

  toggleLock: async (id) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc || sc.isSystem) return;
    const next = !sc.isLocked;
    const { error } = await (supabase as any)
      .from("budget_scenarios")
      .update({ is_locked: next, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, isLocked: next } : x)),
    }));
    logAudit(sc, "lock", next ? "Locked" : "Unlocked");
  },

  setBaseScenario: async (id) => {
    // Clear other base flags owned by the same user; mark this row.
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await (supabase as any)
      .from("budget_scenarios")
      .update({ is_base: false })
      .eq("owner_id", u.user.id);
    const { error } = await (supabase as any)
      .from("budget_scenarios")
      .update({ is_base: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      scenarios: s.scenarios.map((x) => ({ ...x, isBase: x.id === id })),
    }));
    logAudit(sc, "base", "Set as base scenario");
  },

  updateAssumptions: (id, patch) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc || sc.isLocked) return;
    const nextAssumptions = { ...sc.assumptions, ...patch } as Assumptions;
    set((s) => ({
      scenarios: s.scenarios.map((x) =>
        x.id === id ? { ...x, assumptions: nextAssumptions } : x,
      ),
    }));
    queueWrite(id, { assumptions: nextAssumptions });
    logAudit(sc, Object.keys(patch).join(", "), `Updated ${Object.keys(patch).join(", ")}`);
  },

  updateYear: (id, yearIndex, patch) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc || sc.isLocked) return;
    const perYear = sc.assumptions.perYear.map((y, i) =>
      i === yearIndex ? { ...y, ...patch } : y,
    );
    const nextAssumptions: Assumptions = { ...sc.assumptions, perYear };
    set((s) => ({
      scenarios: s.scenarios.map((x) =>
        x.id === id ? { ...x, assumptions: nextAssumptions } : x,
      ),
    }));
    queueWrite(id, { assumptions: nextAssumptions });
    logAudit(sc, `Y${yearIndex + 1}.${Object.keys(patch).join(", ")}`, `Y${yearIndex + 1}: ${Object.keys(patch).join(", ")}`);
  },

  setActual: (id, year, month, patch) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc || sc.isLocked) return;
    const rows = sc.actuals?.rows ?? [];
    const idx = rows.findIndex((r) => r.year === year && r.month === month);
    const next = idx >= 0
      ? rows.map((r, i) => (i === idx ? { ...r, ...patch, year, month } : r))
      : [...rows, { year, month, ...patch }];
    const actuals = { rows: next };
    set((s) => ({
      scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, actuals } : x)),
    }));
    queueWrite(id, { actuals });
  },

  clearActuals: (id, year) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc || sc.isLocked) return;
    const rows = year == null ? [] : (sc.actuals?.rows ?? []).filter((r) => r.year !== year);
    const actuals = { rows };
    set((s) => ({
      scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, actuals } : x)),
    }));
    queueWrite(id, { actuals });
  },

  setContractStartDate: async (id, date) => {
    const { error } = await (supabase as any)
      .from("budget_scenarios")
      .update({ contract_start_date: date ?? null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    set((s) => ({
      scenarios: s.scenarios.map((x) =>
        x.id === id ? { ...x, contractStartDate: date ?? undefined } : x,
      ),
    }));
  },

  resetActive: (id) => {
    const sc = get().scenarios.find((s) => s.id === id);
    if (!sc || sc.isLocked) return;
    const nextAssumptions = structuredClone(SEED_ASSUMPTIONS);
    set((s) => ({
      scenarios: s.scenarios.map((x) =>
        x.id === id ? { ...x, assumptions: nextAssumptions } : x,
      ),
    }));
    queueWrite(id, { assumptions: nextAssumptions });
    logAudit(sc, "reset", "Reset to defaults");
  },

  flush: async () => {
    const ids = Array.from(pendingTimers.keys());
    await Promise.all(ids.map((id) => flushScenario(id)));
  },

  subscribeRealtime: () => {
    const channel = (supabase as any)
      .channel("budget_scenarios_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budget_scenarios" },
        (payload: any) => {
          const event = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          if (event === "DELETE") {
            const id = (payload.old as RemoteRow)?.id;
            if (!id) return;
            set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) }));
            return;
          }
          const row = payload.new as RemoteRow | undefined;
          if (!row) return;
          // Skip echoes of our own pending writes.
          if (pendingTimers.has(row.id)) return;
          const sc = rowToScenario(row);
          set((s) => {
            const exists = s.scenarios.some((x) => x.id === sc.id);
            return {
              scenarios: exists
                ? s.scenarios.map((x) => (x.id === sc.id ? sc : x))
                : [sc, ...s.scenarios],
            };
          });
        },
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  },
}));

// Convenience hooks.
export function useActiveScenario(): Scenario | undefined {
  const scenarios = useBudgetStore((s) => s.scenarios);
  const id = useBudgetUi((s) => s.activeScenarioId);
  return scenarios.find((s) => s.id === id) ?? scenarios[0];
}

export function useIsLocked(id: string | undefined): boolean {
  const scenarios = useBudgetStore((s) => s.scenarios);
  if (!id) return false;
  return scenarios.find((s) => s.id === id)?.isLocked ?? false;
}
