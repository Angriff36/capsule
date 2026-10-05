import type { Doc } from "../../lib/api";

export type LeftoverDisposition = Doc<"leftoverDispositions">;
export type LeftoverDispositionKind = LeftoverDisposition["disposition"];

export const LEFTOVER_DISPOSITION_LABELS: Record<
  LeftoverDispositionKind,
  string
> = {
  donated: "Donated",
  returned_to_stock: "Returned to stock",
  discarded: "Discarded",
};

/** The values the record and revise commands take (eventId aside). */
export interface LeftoverDispositionValues {
  disposition: LeftoverDispositionKind;
  itemDescription: string;
  dispositionDate: string;
  weightLb?: number;
  estimatedValue?: number;
  recipientOrganization?: string;
  recipientTaxId?: string;
  recipientAddress?: string;
  recipientContact?: string;
  receiptReference?: string;
  handlingNote?: string;
  note?: string;
}

const text = (data: FormData, name: string): string | undefined => {
  const value = String(data.get(name) ?? "").trim();
  return value ? value : undefined;
};

const amount = (data: FormData, name: string): number | undefined => {
  const value = text(data, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Reads the leftover form. Recipient fields only travel with a donation, so
 * switching a row to "discarded" clears them.
 */
export function leftoverValuesFromForm(
  data: FormData,
): LeftoverDispositionValues {
  const disposition = String(
    data.get("disposition") ?? "donated",
  ) as LeftoverDispositionKind;
  const donated = disposition === "donated";
  return {
    disposition,
    itemDescription: text(data, "itemDescription") ?? "",
    dispositionDate: text(data, "dispositionDate") ?? "",
    weightLb: amount(data, "weightLb"),
    estimatedValue: amount(data, "estimatedValue"),
    recipientOrganization: donated
      ? text(data, "recipientOrganization")
      : undefined,
    recipientTaxId: donated ? text(data, "recipientTaxId") : undefined,
    recipientAddress: donated ? text(data, "recipientAddress") : undefined,
    recipientContact: donated ? text(data, "recipientContact") : undefined,
    receiptReference: donated ? text(data, "receiptReference") : undefined,
    handlingNote: text(data, "handlingNote"),
    note: text(data, "note"),
  };
}

export function activeLeftovers(
  rows: LeftoverDisposition[] | undefined,
): LeftoverDisposition[] {
  return (rows ?? []).filter(
    (row) => row.deletedAt == null && row.recordedAt != null,
  );
}

export function leftoverYear(row: LeftoverDisposition): number | null {
  const year = Number(row.dispositionDate.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

export interface DonationRecipientTotal {
  organization: string;
  taxId?: string;
  address?: string;
  contact?: string;
  donations: number;
  weightLb: number;
  estimatedValue: number;
  missingReceipts: number;
}

export interface DonationYearSummary {
  year: number;
  donations: LeftoverDisposition[];
  recipients: DonationRecipientTotal[];
  weightLb: number;
  estimatedValue: number;
  missingReceipts: number;
  returnedToStockLb: number;
  discardedLb: number;
}

const recipientKey = (name: string) => name.trim().toLowerCase();

/**
 * One calendar year of leftovers: donations by recipient (for the tax
 * file) plus the pounds returned to stock or thrown out (for the
 * sustainability picture). Recipients with the same name, any case, merge.
 */
export function donationYearSummary(
  rows: LeftoverDisposition[],
  year: number,
): DonationYearSummary {
  const inYear = rows.filter((row) => leftoverYear(row) === year);
  const donations = inYear
    .filter((row) => row.disposition === "donated")
    .sort((a, b) => a.dispositionDate.localeCompare(b.dispositionDate));
  const byRecipient = new Map<string, DonationRecipientTotal>();
  for (const row of donations) {
    const organization = row.recipientOrganization?.trim() || "Unnamed";
    const key = recipientKey(organization);
    const total = byRecipient.get(key) ?? {
      organization,
      donations: 0,
      weightLb: 0,
      estimatedValue: 0,
      missingReceipts: 0,
    };
    total.donations += 1;
    total.weightLb += Number(row.weightLb ?? 0);
    total.estimatedValue += Number(row.estimatedValue ?? 0);
    if (!row.receiptReference) total.missingReceipts += 1;
    total.taxId ??= row.recipientTaxId ?? undefined;
    total.address ??= row.recipientAddress ?? undefined;
    total.contact ??= row.recipientContact ?? undefined;
    byRecipient.set(key, total);
  }
  const recipients = [...byRecipient.values()].sort(
    (a, b) => b.weightLb - a.weightLb,
  );
  const pounds = (kind: LeftoverDispositionKind) =>
    inYear
      .filter((row) => row.disposition === kind)
      .reduce((sum, row) => sum + Number(row.weightLb ?? 0), 0);
  return {
    year,
    donations,
    recipients,
    weightLb: recipients.reduce((sum, r) => sum + r.weightLb, 0),
    estimatedValue: recipients.reduce((sum, r) => sum + r.estimatedValue, 0),
    missingReceipts: recipients.reduce((sum, r) => sum + r.missingReceipts, 0),
    returnedToStockLb: pounds("returned_to_stock"),
    discardedLb: pounds("discarded"),
  };
}

/** Years that have leftovers, newest first, always including this year. */
export function leftoverYears(
  rows: LeftoverDisposition[],
  currentYear: number,
): number[] {
  const years = new Set<number>([currentYear]);
  for (const row of rows) {
    const year = leftoverYear(row);
    if (year != null) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function formatPounds(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} lb`;
}

/** Today as YYYY-MM-DD in the browser's own time zone. */
export function todayDateKey(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
