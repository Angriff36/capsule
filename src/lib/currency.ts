// Curated ISO 4217 list — covers the catering destination-event use case
// (international clients) without pulling in a full CLDR data dump. Operators
// can still type any three-letter code in the form; this list only controls
// the picker suggestions.
export const SUPPORTED_CURRENCY_CODES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "MXN",
  "JPY",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "BRL",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "ZAR",
  "SGD",
  "HKD",
  "INR",
  "PHP",
  "THB",
  "AED",
  "ILS",
  "TRY",
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export const CURRENCY_CODE_PATTERN = /^[A-Za-z]{3}$/;

export const CURRENCY_LABEL: Record<string, string> = {
  USD: "USD — US Dollar",
  CAD: "CAD — Canadian Dollar",
  EUR: "EUR — Euro",
  GBP: "GBP — Pound Sterling",
  AUD: "AUD — Australian Dollar",
  NZD: "NZD — New Zealand Dollar",
  MXN: "MXN — Mexican Peso",
  JPY: "JPY — Japanese Yen",
  CHF: "CHF — Swiss Franc",
  SEK: "SEK — Swedish Krona",
  NOK: "NOK — Norwegian Krone",
  DKK: "DKK — Danish Krone",
  BRL: "BRL — Brazilian Real",
  ARS: "ARS — Argentine Peso",
  CLP: "CLP — Chilean Peso",
  COP: "COP — Colombian Peso",
  PEN: "PEN — Peruvian Sol",
  ZAR: "ZAR — South African Rand",
  SGD: "SGD — Singapore Dollar",
  HKD: "HKD — Hong Kong Dollar",
  INR: "INR — Indian Rupee",
  PHP: "PHP — Philippine Peso",
  THB: "THB — Thai Baht",
  AED: "AED — UAE Dirham",
  ILS: "ILS — Israeli Shekel",
  TRY: "TRY — Turkish Lira",
};

export function isValidCurrencyCode(value: unknown): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return CURRENCY_CODE_PATTERN.test(normalized);
}

export function normalizeCurrencyCode(
  value: unknown,
  fallback = "USD",
): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return CURRENCY_CODE_PATTERN.test(normalized) ? normalized : fallback;
}

export function formatCurrencyLabel(code: unknown): string {
  const normalized = normalizeCurrencyCode(code);
  return CURRENCY_LABEL[normalized] ?? normalized;
}
