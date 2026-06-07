import type { ReactNode, Ref } from "react";
import { ChevronDown, Clock, CheckCircle2, XCircle, AlertTriangle, type LucideIcon } from "lucide-react";

export function Card({
  title,
  icon: Icon,
  children,
  refEl,
  collapsible,
  open,
  onToggle,
  headerRight,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  refEl?: Ref<HTMLElement>;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  headerRight?: ReactNode;
}) {
  const isOpen = collapsible ? !!open : true;
  return (
    <section ref={refEl} className="rounded-lg border border-border bg-panel p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-base sm:text-lg font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {headerRight}
          {collapsible && (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
              aria-expanded={isOpen}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              {isOpen ? "Hide" : "Open"}
            </button>
          )}
        </div>
      </div>
      {isOpen && children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: LucideIcon; cls: string; label: string }> = {
    pending: { icon: Clock, cls: "text-amber-500", label: "Pending" },
    sent: { icon: CheckCircle2, cls: "text-emerald-500", label: "Sent" },
    rejected: { icon: XCircle, cls: "text-muted-foreground", label: "Rejected" },
    failed: { icon: AlertTriangle, cls: "text-destructive", label: "Failed" },
  };
  const m = map[status] ?? map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
