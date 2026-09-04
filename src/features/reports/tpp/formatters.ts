import type { TppCellValue } from "./types";

export const DAY_MS = 86_400_000;

export function formatTppDate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(value);
}

export function formatTppMoney(
  value: number | null | undefined,
  currency = "USD",
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value ?? 0);
}

export function formatTppQuantity(
  value: number | null | undefined,
  maximumFractionDigits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(
    value,
  );
}

export function safeLabelPart(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayCell(value: TppCellValue): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
