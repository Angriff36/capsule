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

/** Date and time together, e.g. "Sep 22, 2026 2:00 PM". */
export function formatDateTime(at: number | string | null | undefined): string {
  if (at == null) return "—";
  const d = new Date(at);
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`;
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

/**
 * A stored code such as "private_party" read as words ("Private party") for
 * clients. Text a person typed with spaces or capitals stays as typed.
 */
export function formatCodeAsWords(value: string): string {
  const text = value.trim();
  if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(text)) return text;
  const words = text.replace(/[_-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
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

/** Amounts of food and stock: up to two decimals, so recipe math never shows
 *  float noise like 3.2000000000000006. */
export function formatQuantity(n: number | string | null | undefined): string {
  const value = Number(n);
  if (n == null || n === "" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
