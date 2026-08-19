import { normalizeCurrencyCode } from "./currency";

export { normalizeCurrencyCode };

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const defaultMoneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const numFmt = new Intl.NumberFormat("en-US");

export function formatDate(ms: number | null | undefined): string {
  return ms == null ? "—" : dateFmt.format(ms);
}

export function formatTime(ms: number | null | undefined): string {
  return ms == null ? "—" : timeFmt.format(ms);
}

// Single-currency callers keep using the legacy signature; per-row callers
// pass the invoice's currencyCode so financial reports stay coherent in
// mixed-currency ledgers. Unknown / null codes fall back to USD.
export function formatMoney(
  n: number | null | undefined,
  currencyCode?: string | null,
): string {
  if (n == null) return "—";
  const code = normalizeCurrencyCode(currencyCode);
  if (code === "USD") return defaultMoneyFmt.format(n);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
}

const exactMoneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money with cents, for invoices/orders where exact amounts matter. */
export function formatMoneyExact(n: number | null | undefined): string {
  return n == null ? "—" : exactMoneyFmt.format(n);
}

export function formatCount(n: number | null | undefined): string {
  return n == null ? "—" : numFmt.format(n);
}

/** "1 record" / "2 records" — count badges never read "1 records". */
export function formatCountNoun(
  n: number,
  noun: string,
  plural = `${noun}s`,
): string {
  return `${numFmt.format(n)} ${n === 1 ? noun : plural}`;
}

export function formatPercent(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}

export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeDays(ms: number, from = Date.now()): string {
  const days = Math.round((ms - from) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
