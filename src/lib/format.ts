const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const moneyFmt = new Intl.NumberFormat("en-US", {
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

export function formatMoney(n: number | null | undefined): string {
  return n == null ? "—" : moneyFmt.format(n);
}

export function formatCount(n: number | null | undefined): string {
  return n == null ? "—" : numFmt.format(n);
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
