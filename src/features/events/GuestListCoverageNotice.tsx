import { AlertTriangleIcon } from "../../ui/icons";

/** Guest lists below this share of the sold headcount are flagged as sparse. */
const SPARSE_COVERAGE_RATIO = 0.5;

export type GuestListCoverage = {
  severity: "empty" | "sparse";
  guestCount: number;
  expectedHeadcount: number;
};

/**
 * Compares the recorded guest list against the event's sold headcount.
 * Returns null when coverage is fine (or when there is no headcount to
 * compare against). Pure — shared by the Guests tab and the printed
 * allergen briefing so both surfaces warn identically.
 */
export function assessGuestListCoverage(
  guestCount: number,
  expectedHeadcount: number | null | undefined,
): GuestListCoverage | null {
  const expected = Number(expectedHeadcount);
  if (!Number.isFinite(expected) || expected <= 0) return null;
  if (guestCount === 0) {
    return { severity: "empty", guestCount, expectedHeadcount: expected };
  }
  if (guestCount < expected * SPARSE_COVERAGE_RATIO) {
    return { severity: "sparse", guestCount, expectedHeadcount: expected };
  }
  return null;
}

/**
 * Warning banner shown when the guest list is empty (or far below) the sold
 * headcount, so an empty allergen briefing cannot be mistaken for "no
 * allergens / no guests".
 */
export function GuestListCoverageNotice({
  coverage,
}: {
  coverage: GuestListCoverage | null;
}) {
  if (coverage == null) return null;
  const { severity, guestCount, expectedHeadcount } = coverage;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xs border border-warn/40 bg-warn-soft/60 px-3 py-2.5 text-base text-ink"
      data-testid="guest-list-coverage-notice"
    >
      <AlertTriangleIcon
        width={15}
        height={15}
        className="mt-0.5 shrink-0 text-warn"
      />
      <div>
        <p className="font-semibold text-warn">
          {severity === "empty"
            ? `No guests recorded — this event expects ${expectedHeadcount}.`
            : `Only ${guestCount} of ${expectedHeadcount} expected guests are recorded.`}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">
          The allergen briefing only covers guests on this list. Until the list
          is filled in, an empty briefing means &ldquo;not recorded yet&rdquo; —
          not &ldquo;no allergies or dietary needs&rdquo;.
        </p>
      </div>
    </div>
  );
}
