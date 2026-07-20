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
import { getSwarmConfig, saveSwarmConfig } from "@/serverfns/swarm.functions";

type Props = {
  active: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
};

export function SwarmPopover({ active, onToggle, disabled }: Props) {
  const load = useServerFn(getSwarmConfig);
  const save = useServerFn(saveSwarmConfig);
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["swarm-config"], queryFn: () => load() });

  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [synth, setSynth] = useState<string>("");
  const [maxParallel, setMaxParallel] = useState<number>(4);

  useEffect(() => {
    if (!cfg) return;
    setModels(cfg.models);
    setSynth(cfg.synthModel);
    setMaxParallel(cfg.maxParallel);
  }, [cfg]);

  const saveM = useMutation({
    mutationFn: async () =>
      save({ data: { models, synthModel: synth, maxParallel } }),
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
  const canEnable = (cfg?.models.length ?? 0) >= 2;
  const activeCount = cfg?.models.length ?? 0;

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
            ? "Configure at least 2 swarm models first"
            : active
              ? `Swarm ON — ${activeCount} models will draft, synthesized by ${cfg?.available.find((a) => a.slug === cfg?.synthModel)?.label ?? "synthesizer"}`
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
            title="Configure swarm models"
            aria-label="Swarm settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Drafters ({models.length})
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
              Pick 2–6. All run in parallel on the same prompt.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Synthesizer
            </div>
            <RadioGroup value={synth} onValueChange={setSynth} className="space-y-1">
              {(cfg?.available ?? []).map((m) => (
                <label key={m.slug} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1">
                  <RadioGroupItem value={m.slug} />
                  <span>{m.label}</span>
                </label>
              ))}
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Merges the drafts into one final answer. Claude Opus 4.7 recommended.
            </p>
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
              disabled={saveM.isPending || models.length < 2}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
