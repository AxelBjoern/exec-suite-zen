// Slice 2 — Chat mode tri-toggle: Single (default, current behavior),
// Auto (classifier picks single vs swarm per message), Swarm (always swarm).
import { Sparkles, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMode = "single" | "auto" | "swarm";

const OPTIONS: Array<{ id: ChatMode; label: string; icon: any; hint: string }> = [
  { id: "single", label: "Single", icon: User, hint: "One model answers (current behavior)" },
  { id: "auto", label: "Auto", icon: Sparkles, hint: "Router picks single or swarm per message" },
  { id: "swarm", label: "Swarm", icon: Users, hint: "Always run the multi-agent swarm" },
];

export function ChatModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ChatMode;
  onChange: (m: ChatMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Chat mode"
      className="inline-flex items-center rounded-md border border-border/60 bg-background/60 p-0.5"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            type="button"
            disabled={disabled}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
