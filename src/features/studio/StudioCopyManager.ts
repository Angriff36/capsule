import type { Id } from "../../lib/api";
import type { StudioCopyRow } from "./StudioCopyApplier";
import type { StudioCopySpot } from "./StudioCopySpot";

type CopyDoc = StudioCopyRow & {
  _id: Id<"screenCopyOverrides">;
};

type CreateCopy = (args: {
  pagePattern: string;
  copyKey: string;
  originalText: string;
  text: string;
  targetSelector?: string;
  targetLabel?: string;
  idempotencyKey?: string;
}) => Promise<unknown>;

type ChangeCopy = (args: {
  docId: Id<"screenCopyOverrides">;
  version?: number;
  pagePattern: string;
  copyKey: string;
  originalText: string;
  text: string;
  targetSelector?: string;
  targetLabel?: string;
}) => Promise<unknown>;

type RevertCopy = (args: {
  docId: Id<"screenCopyOverrides">;
  version?: number;
}) => Promise<unknown>;

/** Saves or restores one wording change. */
export class StudioCopyManager {
  constructor(
    private readonly rows: readonly CopyDoc[],
    private readonly create: CreateCopy,
    private readonly change: ChangeCopy,
    private readonly revertCmd: RevertCopy,
  ) {}

  liveOn(pagePattern: string): CopyDoc[] {
    return this.rows.filter(
      (row) => row.deletedAt == null && row.pagePattern === pagePattern,
    );
  }

  /** The spot's row, found by its place on the screen; a live row wins. */
  matching(spot: StudioCopySpot): CopyDoc | undefined {
    const same = this.rows.filter(
      (row) =>
        row.pagePattern === spot.pagePattern &&
        (row.copyKey === spot.copyKey || row.targetSelector === spot.selector),
    );
    return same.find((row) => row.deletedAt == null) ?? same[0];
  }

  /** The words the spot had before anyone changed them. */
  originalText(spot: StudioCopySpot): string {
    const existing = this.matching(spot);
    return existing?.originalText || spot.originalText;
  }

  async save(spot: StudioCopySpot, text: string): Promise<void> {
    const existing = this.matching(spot);
    const next = text.trim();
    if (existing && existing.deletedAt == null && existing.text === next)
      return;
    if (existing && existing.originalText === next) {
      // Typing the first words back is the same as restoring them.
      if (existing.deletedAt == null)
        await this.revertCmd({
          docId: existing._id,
          version: existing.version,
        });
      return;
    }
    if (existing) {
      await this.change({
        docId: existing._id,
        version: existing.version,
        pagePattern: spot.pagePattern,
        copyKey: existing.copyKey,
        originalText: existing.originalText || spot.originalText,
        text: next,
        targetSelector: spot.selector,
        targetLabel: spot.targetLabel,
      });
      return;
    }
    // No fixed retry key: saved edits list hides restored rows, so a spot
    // edited again after a restore needs a new row, and a fixed key would
    // replay the first save and keep nothing.
    await this.create({
      pagePattern: spot.pagePattern,
      copyKey: spot.copyKey,
      originalText: spot.originalText,
      text: next,
      targetSelector: spot.selector,
      targetLabel: spot.targetLabel,
    });
  }

  async revert(spot: StudioCopySpot): Promise<void> {
    await this.revertKey(spot.pagePattern, spot.copyKey);
  }

  async revertKey(pagePattern: string, copyKey: string): Promise<void> {
    const existing = this.rows.find(
      (row) => row.pagePattern === pagePattern && row.copyKey === copyKey,
    );
    if (!existing || existing.deletedAt != null) return;
    await this.revertCmd({ docId: existing._id, version: existing.version });
  }
}
