import { localDayEndExclusive, localDayStart } from "./payrollPeriod";

const minutes = (value: FormDataEntryValue | null) => {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) ? Math.trunc(amount) : Number.NaN;
};

/**
 * Builds a PayrollInput.prepare payload from the prepare form.
 *
 * Period semantics match the export preview: whole local days, end date
 * inclusive. periodStart is local midnight of the start date and periodEnd is
 * the last millisecond of the end date, so a "Jan 9 → Jan 9" input covers the
 * same records the Jan 9 → Jan 9 export preview counts.
 */
export class PayrollPreparePayloadBuilder {
  fromForm(data: FormData) {
    const personId = String(data.get("personId") || "").trim();
    const periodStartRaw = String(data.get("periodStart") || "").trim();
    const periodEndRaw = String(data.get("periodEnd") || "").trim();
    const regularMinutes = minutes(data.get("regularMinutes"));
    const overtimeMinutes = minutes(data.get("overtimeMinutes"));
    const eventId = String(data.get("eventId") || "").trim();
    if (!personId || !periodStartRaw || !periodEndRaw) {
      throw new Error("Person and payroll period are required.");
    }
    if (
      [regularMinutes, overtimeMinutes].some((n) => Number.isNaN(n) || n < 0)
    ) {
      throw new Error("Regular and overtime minutes must be non-negative.");
    }
    const periodStart = localDayStart(periodStartRaw);
    const periodEndExclusive = localDayEndExclusive(periodEndRaw);
    if (
      !Number.isFinite(periodStart) ||
      !Number.isFinite(periodEndExclusive) ||
      periodEndExclusive <= periodStart
    ) {
      throw new Error("Period end must be on or after period start.");
    }
    // Rates/grossAmount are private encrypted money in source; Convex schema
    // still projects them as number while encryption stores ciphertext — omit
    // until Manifest projects encrypted money storage correctly (issue #76).
    return {
      personId,
      periodStart,
      periodEnd: periodEndExclusive - 1,
      regularMinutes,
      overtimeMinutes,
      totalMinutes: regularMinutes + overtimeMinutes,
      eventId: eventId || undefined,
      notes: String(data.get("notes") || "").trim() || undefined,
    };
  }
}
