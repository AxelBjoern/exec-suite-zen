/** Reporting currency for the budget module. */
export const CURRENCY = "AED";

/** USD → AED peg used for all currency conversions in the model. */
export const USD_TO_AED = 3.6725;

const LOCALE = "en-AE";

/** Formats a money amount in the reporting currency (no symbol; see CURRENCY). */
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
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Preferred alias for money formatting. */
export const fmtMoney = fmtSEK;

export function fmtNum(n: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Math.round(n));
}


export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}


export function fmtSigned(n: number): string {
  if (n < 0) return `(${fmtSEK(-n)})`;
  return fmtSEK(n);
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
