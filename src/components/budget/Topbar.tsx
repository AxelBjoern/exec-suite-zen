import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Lock, Plus, Star, Trash2, Copy } from "lucide-react";
import { VdnxLoader } from "@/components/VdnxLoader";
import { useBudgetStore, useActiveScenario, useBudgetUi } from "@/lib/budget/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type NavItem = { to: string; label: string; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/budget", label: "Overview", exact: true },
  { to: "/budget/board", label: "Board" },
  { to: "/budget/assumptions", label: "Assumptions" },
  { to: "/budget/monthly", label: "Monthly" },
  { to: "/budget/statements", label: "Statements" },
  { to: "/budget/financing", label: "Financing" },
  { to: "/budget/sensitivity", label: "Sensitivity" },
  { to: "/budget/compare", label: "Compare" },
  { to: "/budget/results", label: "Results" },
  { to: "/budget/scenarios", label: "Scenarios" },
  { to: "/budget/changelog", label: "Changelog" },
];

export function BudgetTopbar() {
  const load = useBudgetStore((s) => s.load);
  const loading = useBudgetStore((s) => s.loading);
  const scenarios = useBudgetStore((s) => s.scenarios);
  const active = useActiveScenario();
  const setActiveId = useBudgetUi((s) => s.setActiveScenario);
  const setSelectedYear = useBudgetUi((s) => s.setSelectedYear);
  const selectedYear = useBudgetUi((s) => s.selectedYear);

  const addScenario = useBudgetStore((s) => s.addScenario);
  const duplicate = useBudgetStore((s) => s.duplicateScenario);
  const remove = useBudgetStore((s) => s.deleteScenario);
  const rename = useBudgetStore((s) => s.renameScenario);
  const toggleLock = useBudgetStore((s) => s.toggleLock);
  const setBase = useBudgetStore((s) => s.setBaseScenario);

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => { void load(); }, [load]);

  const router = useRouterState();
  const pathname = router.location.pathname;

  const years = useMemo(() => {
    if (!active) return [] as number[];
    const start = active.assumptions.startYear;
    return Array.from({ length: active.assumptions.years }, (_, i) => start + i);
  }, [active]);

  useEffect(() => {
    if (years.length && !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear, setSelectedYear]);

  return (
    <div className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
        {/* Scenario menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Scenario</span>
              <span className="font-medium">
                {loading && !active ? "Loading…" : active?.name ?? "—"}
              </span>
              {active?.isSystem && <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">VDNX</span>}
              {active?.isBase && <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Base</span>}
              {active?.isLocked && <Lock className="h-3 w-3" />}
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[320px]">
            <DropdownMenuLabel>Scenarios</DropdownMenuLabel>
            <div className="max-h-72 overflow-y-auto">
              {scenarios.map((s) => (
                <div key={s.id} className="group flex items-center gap-1 px-1">
                  <button
                    onClick={() => setActiveId(s.id)}
                    className={`flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      active?.id === s.id ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {s.isBase && <Star className="h-3 w-3 text-primary" />}
                      {s.isSystem && <span className="text-[9px] uppercase tracking-wider text-primary">VDNX</span>}
                      <span className="truncate">{s.name}</span>
                      {s.isLocked && <Lock className="ml-auto h-3 w-3 opacity-60" />}
                    </div>
                  </button>
                  <button
                    title="Duplicate"
                    onClick={() => duplicate(s.id).then((c) => c && toast.success(`Duplicated as ${c.name}`)).catch((e) => toast.error(e.message))}
                    className="invisible rounded p-1 hover:bg-accent group-hover:visible"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {!s.isSystem && (
                    <button
                      title="Delete"
                      onClick={() => {
                        if (confirm(`Delete "${s.name}"?`)) {
                          remove(s.id).catch((e) => toast.error(e.message));
                        }
                      }}
                      className="invisible rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {!loading && scenarios.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No scenarios yet.</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 px-2 py-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New scenario name"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    addScenario(newName.trim()).then(() => setNewName("")).catch((er) => toast.error(er.message));
                  }
                }}
              />
              <Button
                size="sm"
                disabled={!newName.trim()}
                onClick={() => addScenario(newName.trim()).then(() => setNewName("")).catch((er) => toast.error(er.message))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {active && !active.isSystem && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setRenaming(active.id);
                    setRenameValue(active.name);
                  }}
                >
                  Rename "{active.name}"…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setBase(active.id).catch((e) => toast.error(e.message))}>
                  <Star className="mr-2 h-4 w-4" /> Set as base
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleLock(active.id).catch((e) => toast.error(e.message))}>
                  <Lock className="mr-2 h-4 w-4" /> {active.isLocked ? "Unlock" : "Lock"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Year selector */}
        {years.length > 0 && (
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5">
            <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Year</span>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`rounded px-2 py-1 text-xs font-medium transition ${
                  y === selectedYear ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {loading && <span className="ml-2"><VdnxLoader size="xs" /></span>}

        {/* Nav */}
        <nav className="ml-auto flex flex-wrap items-center gap-1">
          {NAV.map((item) => {
            const isActive = item.exact ? pathname === item.to : pathname.startsWith(item.to) && pathname !== "/budget";
            const overviewActive = item.exact && pathname === "/budget";
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  isActive || overviewActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {renaming && (
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 pb-3">
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="h-8 max-w-xs text-sm"
            placeholder="New name"
            autoFocus
          />
          <Button
            size="sm"
            disabled={!renameValue.trim()}
            onClick={() => {
              rename(renaming, renameValue.trim())
                .then(() => { setRenaming(null); toast.success("Renamed"); })
                .catch((e) => toast.error(e.message));
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
