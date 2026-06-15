type Size = "xs" | "sm" | "md" | "lg";

type Props = {
  label?: string;
  size?: Size;
  className?: string;
};

const SIZES: Record<Size, {
  font: number; tracking: number; stroke: number; bar: number; barH: number;
  dot: number; tagFont: number; gap: number; showTag: boolean; showLines: boolean;
}> = {
  xs: { font: 14, tracking: -1, stroke: 0.6, bar: 56, barH: 2, dot: 2, tagFont: 0, gap: 2, showTag: false, showLines: false },
  sm: { font: 28, tracking: -2, stroke: 1, bar: 140, barH: 3, dot: 3, tagFont: 9, gap: 6, showTag: true, showLines: false },
  md: { font: 64, tracking: -4, stroke: 1.5, bar: 240, barH: 4, dot: 5, tagFont: 11, gap: 14, showTag: true, showLines: true },
  lg: { font: 102, tracking: -7, stroke: 2.5, bar: 300, barH: 5, dot: 7, tagFont: 13.5, gap: 22, showTag: true, showLines: true },
};

export function VdnxLoader({ label = "LOADING", size = "sm", className = "" }: Props) {
  const s = SIZES[size];
  const strokeColor = "color-mix(in oklab, var(--primary) 60%, black)";
  return (
    <div className={`inline-flex flex-col items-center ${className}`} role="status" aria-label={label}>
      <div className="relative" style={{ paddingInline: s.dot * 3 }}>
        {s.showLines && (
          <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
            <line x1="10%" y1="30%" x2="90%" y2="70%" stroke="var(--gold)" strokeWidth="1.2" strokeOpacity="0.2" strokeDasharray="4 4" style={{ animation: "vdnx-dash 2.8s linear infinite" }} />
            <line x1="90%" y1="30%" x2="10%" y2="70%" stroke="var(--gold)" strokeWidth="1.2" strokeOpacity="0.2" strokeDasharray="4 4" style={{ animation: "vdnx-dash 2.8s linear infinite" }} />
          </svg>
        )}
        <span
          className="block font-black leading-none"
          style={{
            fontSize: s.font,
            letterSpacing: s.tracking,
            color: "var(--primary)",
            WebkitTextStroke: `${s.stroke}px ${strokeColor}`,
            textShadow: size === "xs" ? "none" : "0 0 12px color-mix(in oklab, var(--gold) 40%, transparent), 0 0 24px color-mix(in oklab, var(--amber) 25%, transparent)",
            animation: "vdnx-logo-pulse 3.5s ease-in-out infinite",
          }}
        >
          VDNX
        </span>
        {s.showLines && (
          <>
            <Dot size={s.dot} top="22%" left="6%" delay="0s" />
            <Dot size={s.dot} top="32%" left="88%" delay="0.7s" />
            <Dot size={s.dot} top="72%" left="10%" delay="1.5s" />
            <Dot size={s.dot} top="58%" left="92%" delay="2.3s" />
          </>
        )}
      </div>
      <div
        className="overflow-hidden rounded-full"
        style={{
          width: s.bar,
          height: s.barH,
          background: "color-mix(in oklab, var(--muted-foreground) 20%, transparent)",
          marginTop: s.gap,
        }}
      >
        <div
          style={{
            height: "100%",
            width: "35%",
            borderRadius: 9999,
            background: "linear-gradient(90deg, var(--gold), var(--amber), var(--primary), var(--gold))",
            backgroundSize: "200% 100%",
            animation: "vdnx-progress 2.8s cubic-bezier(0.45,0,0.55,1) infinite, vdnx-gradient-shift 1.8s linear infinite",
          }}
        />
      </div>
      {s.showTag && (
        <div
          className="font-semibold"
          style={{
            marginTop: s.gap * 0.6,
            fontSize: s.tagFont,
            letterSpacing: size === "lg" ? 4 : 2,
            color: "var(--muted-foreground)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function Dot({ size, top, left, delay }: { size: number; top: string; left: string; delay: string }) {
  return (
    <span
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        top,
        left,
        background: "var(--gold)",
        boxShadow: `0 0 ${size * 1.7}px var(--gold-muted), 0 0 ${size * 3}px color-mix(in oklab, var(--amber) 60%, transparent)`,
        animation: `vdnx-neural-pulse 3.2s ease-in-out infinite ${delay}`,
      }}
      aria-hidden
    />
  );
}

export function VdnxScreen({ label = "LOADING" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <VdnxLoader size="lg" label={label} />
    </div>
  );
}
