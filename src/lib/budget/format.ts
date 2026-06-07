export function fmtSEK(n: number, opts: { compact?: boolean } = {}): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (opts.compact) {
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)} bn`;
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)} k`;
    return `${sign}${abs.toFixed(0)}`;
  }
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(n));
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(n));
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtOre(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(digits)} öre`;
}

export function fmtSekPerKwh(n: number, digits = 3): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(digits)} SEK/kWh`;
}

export function fmtSigned(n: number): string {
  if (n < 0) return `(${fmtSEK(-n)})`;
  return fmtSEK(n);
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
