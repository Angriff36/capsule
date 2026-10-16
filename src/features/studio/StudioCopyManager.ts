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

  matching(spot: StudioCopySpot): CopyDoc | undefined {
    return this.rows.find(
      (row) =>
        row.pagePattern === spot.pagePattern && row.copyKey === spot.copyKey,
    );
  }

  async save(spot: StudioCopySpot, text: string): Promise<void> {
    const existing = this.matching(spot);
    const next = text.trim();
    if (existing && existing.deletedAt == null && existing.text === next)
      return;
    if (existing) {
      await this.change({
        docId: existing._id,
        version: existing.version,
        pagePattern: spot.pagePattern,
        copyKey: spot.copyKey,
        originalText: existing.originalText || spot.originalText,
        text: next,
        targetSelector: spot.selector,
        targetLabel: spot.targetLabel,
      });
      return;
    }
    await this.create({
      pagePattern: spot.pagePattern,
      copyKey: spot.copyKey,
      originalText: spot.originalText,
      text: next,
      targetSelector: spot.selector,
      targetLabel: spot.targetLabel,
      idempotencyKey: `studio-copy:${spot.pagePattern}:${spot.copyKey}`,
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
