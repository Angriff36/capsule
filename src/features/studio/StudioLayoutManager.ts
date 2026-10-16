import type { Id } from "../../lib/api";

export type StudioLayoutRow = {
  _id: Id<"screenLayoutOverrides">;
  pagePattern: string;
  slotKey: string;
  componentId: string;
  sourceComponentId?: string | null;
  slotKind?: string | null;
  targetSelector?: string | null;
  targetLabel?: string | null;
  deletedAt?: number | null;
  version?: number;
};

type CreateLayout = (args: {
  pagePattern: string;
  slotKey: string;
  componentId: string;
  sourceComponentId?: string;
  slotKind?: string;
  targetSelector?: string;
  targetLabel?: string;
  idempotencyKey?: string;
}) => Promise<unknown>;

type ChangeLayout = (args: {
  docId: Id<"screenLayoutOverrides">;
  version?: number;
  pagePattern: string;
  slotKey: string;
  componentId: string;
  sourceComponentId?: string;
  slotKind?: string;
  targetSelector?: string;
  targetLabel?: string;
}) => Promise<unknown>;

type RevertLayout = (args: {
  docId: Id<"screenLayoutOverrides">;
  version?: number;
}) => Promise<unknown>;

/** Saves or restores one catalog swap. */
export class StudioLayoutManager {
  constructor(
    private readonly rows: readonly StudioLayoutRow[],
    private readonly create: CreateLayout,
    private readonly change: ChangeLayout,
    private readonly revertCmd: RevertLayout,
  ) {}

  liveOn(pagePattern: string): StudioLayoutRow[] {
    return this.rows.filter(
      (row) => row.deletedAt == null && row.pagePattern === pagePattern,
    );
  }

  componentId(pagePattern: string, slotKey: string, fallback: string): string {
    const row = this.rows.find(
      (item) =>
        item.deletedAt == null &&
        item.pagePattern === pagePattern &&
        item.slotKey === slotKey,
    );
    return row?.componentId ?? fallback;
  }

  matching(pagePattern: string, slotKey: string): StudioLayoutRow | undefined {
    return this.rows.find(
      (row) => row.pagePattern === pagePattern && row.slotKey === slotKey,
    );
  }

  async save(input: {
    pagePattern: string;
    slotKey: string;
    componentId: string;
    sourceComponentId: string;
    slotKind: string;
    targetSelector?: string;
    targetLabel?: string;
  }): Promise<void> {
    const existing = this.matching(input.pagePattern, input.slotKey);
    if (
      existing &&
      existing.deletedAt == null &&
      existing.componentId === input.componentId
    )
      return;
    if (existing) {
      await this.change({
        docId: existing._id,
        version: existing.version,
        ...input,
      });
      return;
    }
    await this.create({
      ...input,
      idempotencyKey: `studio-layout:${input.pagePattern}:${input.slotKey}`,
    });
  }

  async revert(pagePattern: string, slotKey: string): Promise<void> {
    const existing = this.matching(pagePattern, slotKey);
    if (!existing || existing.deletedAt != null) return;
    await this.revertCmd({
      docId: existing._id,
      version: existing.version,
    });
  }
}
