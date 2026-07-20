import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSwarmConfig, saveSwarmConfig } from "@/serverfns/swarm.functions";

type Props = {
  active: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
};

type AgentCfg = {
  role: string;
  label: string;
  model: string;
  enabled: boolean;
  systemPrompt: string;
  fallbackModel?: string | null;
  timeoutMs?: number | null;
};

export function SwarmPopover({ active, onToggle, disabled }: Props) {
  const load = useServerFn(getSwarmConfig);
  const save = useServerFn(saveSwarmConfig);
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["swarm-config"], queryFn: () => load() });

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"agents" | "models">("agents");
  const [models, setModels] = useState<string[]>([]);
  const [synth, setSynth] = useState<string>("");
  const [maxParallel, setMaxParallel] = useState<number>(4);
  const [agents, setAgents] = useState<AgentCfg[]>([]);

  useEffect(() => {
    if (!cfg) return;
    setModels(cfg.models);
    setSynth(cfg.synthModel);
    setMaxParallel(cfg.maxParallel);
    setAgents(((cfg as any).agents ?? []) as AgentCfg[]);
  }, [cfg]);

  const saveM = useMutation({
    mutationFn: async () =>
      save({ data: { models, synthModel: synth, maxParallel, agents } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["swarm-config"] });
      toast.success("Swarm settings saved");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const toggleModel = (slug: string) => {
    setModels((prev) => (prev.includes(slug) ? prev.filter((m) => m !== slug) : [...prev, slug]));
  };
  const updateAgent = (role: string, patch: Partial<AgentCfg>) => {
    setAgents((prev) => prev.map((a) => (a.role === role ? { ...a, ...patch } : a)));
  };

  const enabledAgentCount = agents.filter((a) => a.enabled).length;
  const canEnable = enabledAgentCount >= 2 || (cfg?.models.length ?? 0) >= 2;
  const activeCount = enabledAgentCount >= 2 ? enabledAgentCount : (cfg?.models.length ?? 0);

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={active ? "default" : "outline"}
        disabled={disabled || !canEnable}
        onClick={() => onToggle(!active)}
        className="h-8 px-2 gap-1.5 text-xs"
        title={
          !canEnable
            ? "Enable at least 2 agents (or pick 2 drafters) first"
            : active
              ? `Swarm ON — ${activeCount} agents will draft, synthesized by ${cfg?.available.find((a) => a.slug === cfg?.synthModel)?.label ?? "synthesizer"}`
              : "Turn on Swarm mode"
        }
      >
        <Users className="h-3.5 w-3.5" />
        <span>{active ? `Swarm · ${activeCount}` : "Swarm"}</span>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Configure swarm agents"
            aria-label="Swarm settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[380px] p-4 space-y-4">
          <div className="flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTab("agents")}
              className={`flex-1 rounded px-2 py-1 ${tab === "agents" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              Agents ({enabledAgentCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("models")}
              className={`flex-1 rounded px-2 py-1 ${tab === "models" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              Drafters ({models.length})
            </button>
          </div>

          {tab === "agents" && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Per-role model
              </div>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {agents.map((a) => {
                  const availableLabel = (slug?: string | null) =>
                    slug ? (cfg?.available.find((m) => m.slug === slug)?.label ?? slug.split("/").pop() ?? slug) : null;
                  const fbLabel = availableLabel(a.fallbackModel);
                  const timeoutS = Math.round(((a.timeoutMs ?? 100_000) / 1000));
                  return (
                    <div key={a.role} className="rounded border border-border/40 bg-muted/20 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={a.enabled}
                          onCheckedChange={(v) => updateAgent(a.role, { enabled: v })}
                        />
                        <div className="w-14 text-sm font-medium">{a.label}</div>
                        <Select
                          value={a.model}
                          onValueChange={(v) => updateAgent(a.role, { model: v })}
                        >
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(cfg?.available ?? []).map((m) => (
                              <SelectItem key={m.slug} value={m.slug} className="text-xs">
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mt-2 grid grid-cols-[52px_1fr] gap-x-2 gap-y-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1.5">Fallback</div>
                        <Select
                          value={a.fallbackModel ?? "__none__"}
                          onValueChange={(v) =>
                            updateAgent(a.role, { fallbackModel: v === "__none__" ? null : v })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-xs">None (fail on primary error)</SelectItem>
                            {(cfg?.available ?? [])
                              .filter((m) => m.slug !== a.model)
                              .map((m) => (
                                <SelectItem key={m.slug} value={m.slug} className="text-xs">
                                  {m.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">Timeout</div>
                        <div className="flex items-center gap-2">
                          <Slider
                            min={15}
                            max={180}
                            step={5}
                            value={[timeoutS]}
                            onValueChange={(v) =>
                              updateAgent(a.role, { timeoutMs: Math.round((v[0] ?? 100) * 1000) })
                            }
                            className="flex-1"
                          />
                          <span className="text-[11px] font-mono w-10 text-right">{timeoutS}s</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 pl-[52px] flex-wrap">
                        <span
                          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-500"
                          title={`Primary attempt uses ${availableLabel(a.model)} with a ${timeoutS}s timeout`}
                        >
                          Primary · {timeoutS}s
                        </span>
                        {fbLabel && fbLabel !== availableLabel(a.model) ? (
                          <span
                            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-500"
                            title={`On primary timeout/error, retries with ${fbLabel}`}
                          >
                            Fallback · {fbLabel}
                          </span>
                        ) : (
                          <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            No fallback
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Enable at least 2 roles. Primary runs for up to its timeout; on timeout or error, the fallback model runs automatically (default 100s primary, DeepSeek V4 Flash fallback).
              </p>
            </div>
          )}

          {tab === "models" && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Fallback drafters
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {(cfg?.available ?? []).map((m) => (
                  <label key={m.slug} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1">
                    <Checkbox
                      checked={models.includes(m.slug)}
                      onCheckedChange={() => toggleModel(m.slug)}
                    />
                    <span className="flex-1">{m.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Used only when fewer than 2 agents are enabled.
              </p>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Synthesizer
            </div>
            <RadioGroup value={synth} onValueChange={setSynth} className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
              {(cfg?.available ?? []).map((m) => (
                <label key={m.slug} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1">
                  <RadioGroupItem value={m.slug} />
                  <span>{m.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Max parallel
              </Label>
              <span className="text-sm font-mono">{maxParallel}</span>
            </div>
            <Slider
              min={2}
              max={6}
              step={1}
              value={[maxParallel]}
              onValueChange={(v) => setMaxParallel(v[0] ?? 4)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveM.mutate()}
              disabled={saveM.isPending || (enabledAgentCount < 2 && models.length < 2)}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
