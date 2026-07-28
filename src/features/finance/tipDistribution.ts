import { formatMoneyExact } from "../../lib/format";

export type TipPoolingMethod = "equal" | "hours" | "role";

export type TipParticipant = {
  personId: string;
  name: string;
  role: string;
  hours: number;
  roleWeight: number;
};

export type TipShare = TipParticipant & {
  basis: number;
  shareCents: number;
  sharePercent: number;
};

export type TipPayrollMarker = {
  amountCents: number;
  eventId: string;
  eventTitle: string;
  method: TipPoolingMethod;
  version: 1;
};

export const TIP_PAYROLL_MARKER = "CAPSULE_GRATUITY_V1";

const methodLabel: Record<TipPoolingMethod, string> = {
  equal: "Equal split",
  hours: "Hours weighted",
  role: "Role weighted",
};

const finiteNonnegative = (value: number) =>
  Number.isFinite(value) && value >= 0 ? value : 0;

export function moneyToCents(value: string): number {
  const normalized = value.trim().replaceAll(",", "");
  if (!normalized) return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter a gratuity total of zero or more.");
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

/**
 * Allocates integer cents by largest remainder, keeping the result stable and
 * guaranteeing that the shares add back to the entered pool exactly.
 */
export function distributeTipPool(
  totalCents: number,
  participants: readonly TipParticipant[],
  method: TipPoolingMethod,
): TipShare[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error("Gratuity must be a non-negative amount in whole cents.");
  }
  if (participants.length === 0) {
    throw new Error("Include at least one assigned staff member.");
  }

  const weighted = participants.map((participant, index) => {
    const basis =
      method === "equal"
        ? 1
        : method === "hours"
          ? finiteNonnegative(participant.hours)
          : finiteNonnegative(participant.roleWeight);
    return { participant, basis, index };
  });
  const totalBasis = weighted.reduce((sum, item) => sum + item.basis, 0);
  if (totalBasis <= 0) {
    throw new Error(
      method === "hours"
        ? "Enter hours above zero for at least one included staff member."
        : "Enter a role weight above zero for at least one included role.",
    );
  }

  const provisional = weighted.map((item) => {
    const exact = (totalCents * item.basis) / totalBasis;
    const shareCents = Math.floor(exact);
    return { ...item, shareCents, remainder: exact - shareCents };
  });
  let centsLeft =
    totalCents - provisional.reduce((sum, item) => sum + item.shareCents, 0);
  const remainderOrder = [...provisional].sort(
    (left, right) =>
      right.remainder - left.remainder || left.index - right.index,
  );
  for (let index = 0; index < remainderOrder.length && centsLeft > 0; index++) {
    remainderOrder[index]!.shareCents += 1;
    centsLeft -= 1;
  }

  return provisional.map(({ participant, basis, shareCents }) => ({
    ...participant,
    basis,
    shareCents,
    sharePercent:
      totalCents === 0
        ? 0
        : Math.round((shareCents / totalCents) * 10_000) / 100,
  }));
}

export function formatTipPayrollNote(marker: TipPayrollMarker): string {
  const amount = formatMoneyExact(marker.amountCents / 100);
  return [
    `Event gratuity · ${marker.eventTitle} · ${methodLabel[marker.method]} · ${amount}`,
    `${TIP_PAYROLL_MARKER} ${JSON.stringify(marker)}`,
  ].join("\n");
}

export function parseTipPayrollNote(value: unknown): TipPayrollMarker | null {
  if (typeof value !== "string") return null;
  const markerLine = value
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${TIP_PAYROLL_MARKER} `));
  if (!markerLine) return null;
  try {
    const parsed = JSON.parse(
      markerLine.slice(TIP_PAYROLL_MARKER.length + 1),
    ) as Partial<TipPayrollMarker>;
    if (
      parsed.version !== 1 ||
      !Number.isSafeInteger(parsed.amountCents) ||
      Number(parsed.amountCents) < 0 ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.eventTitle !== "string" ||
      !["equal", "hours", "role"].includes(String(parsed.method))
    ) {
      return null;
    }
    return parsed as TipPayrollMarker;
  } catch {
    return null;
  }
}

export function payrollNoteDisplayText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(`${TIP_PAYROLL_MARKER} `))
    .join(" ")
    .trim();
}

export function tipPayrollIdempotencyKey({
  eventId,
  method,
  personId,
  shareCents,
  totalCents,
}: {
  eventId: string;
  method: TipPoolingMethod;
  personId: string;
  shareCents: number;
  totalCents: number;
}): string {
  return [
    "tip-distribution-v1",
    eventId,
    method,
    totalCents,
    personId,
    shareCents,
  ].join(":");
}
