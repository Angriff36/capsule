type Pending = {
  savedDishIds: readonly string[];
  baselineDemandRevision: string;
  expectsDemandChange: boolean;
};

export class TemplateStockSyncLifecycle {
  private pending: Pending | null = null;

  begin(input: Pending) {
    this.pending = input;
  }

  next(input: {
    ready: boolean;
    eventDishIds: readonly string[];
    demandRevision: string;
  }): { savedLines: number } | null {
    const pending = this.pending;
    if (!pending || !input.ready) return null;
    const observed = new Set(input.eventDishIds);
    if (pending.savedDishIds.some((id) => !observed.has(id))) return null;
    if (
      pending.expectsDemandChange &&
      input.demandRevision === pending.baselineDemandRevision
    )
      return null;
    return { savedLines: pending.savedDishIds.length };
  }

  failed() {}

  succeeded() {
    this.pending = null;
  }
}
