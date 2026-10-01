import { parsePackSources } from "../../lib/packRules";
import {
  unresolvedReason,
  type PackReadinessLine,
} from "../../lib/packReadiness";
import { packWentOut, type PackReturnLine } from "./packReturn";

/**
 * The counts a packer needs on one pack line (spec §13, AC-554): how many
 * are held for the event, how many are still to pack, how many still have to
 * come back, and the one thing on this line that holds up Mark packed. Pure.
 */
export type PackRowFactsLine = PackReadinessLine &
  PackReturnLine & {
    requiredQuantity: number;
    unit: string;
    sourcesJson?: string | null;
    returnRequired?: boolean | null;
  };

export type PackRowFacts = {
  /** Held for this event through equipment or rental holds; null when none. */
  held: number | null;
  /** Still to pack; zero when the line is packed, left off or missing. */
  toPack: number;
  /** Went out, has to come back and is not counted back yet. */
  toComeBack: number;
  /** Why this line holds up Mark packed, or null. */
  blocking: string | null;
  /** Short plain lines for the sheet, in reading order. */
  notes: string[];
};

const n = (value: number | null | undefined) => Number(value ?? 0) || 0;

const show = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export function packRowFacts(line: PackRowFactsLine): PackRowFacts {
  const holds = parsePackSources(line.sourcesJson).filter(
    (source) => source.sourceType === "rental",
  );
  const held =
    holds.length > 0
      ? holds.reduce((sum, source) => sum + n(source.quantity), 0)
      : null;
  const status = String(line.status);
  const off =
    line.excludedAt != null ||
    line.retiredAt != null ||
    line.deletedAt != null ||
    status === "missing";
  const toPack = off
    ? 0
    : Math.max(0, n(line.requiredQuantity) - n(line.packedQuantity));
  const counted =
    n(line.returnedQuantity) +
    n(line.usedQuantity) +
    n(line.lostQuantity) +
    n(line.damagedQuantity);
  const toComeBack =
    line.returnRequired === true &&
    line.loadedQuantity != null &&
    line.returnCountedAt == null
      ? Math.max(0, packWentOut(line) - counted)
      : 0;
  const blocking = unresolvedReason(line);
  const notes: string[] = [];
  if (held != null) notes.push(`Held for this event ${show(held)}`);
  if (toPack > 0) notes.push(`Still to pack ${show(toPack)} ${line.unit}`);
  if (toComeBack > 0) notes.push(`To come back ${show(toComeBack)}`);
  return { held, toPack, toComeBack, blocking, notes };
}
