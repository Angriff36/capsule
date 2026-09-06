type Phase = "waiting" | "in_flight" | "failed" | "complete";
type Pending = {
  attemptId: number;
  savedDishIds: readonly string[];
  baselineDemandRevision: string;
  expectsDemandChange: boolean;
  phase: Phase;
};

export class TemplateStockSyncLifecycle {
  private pending: Pending | null = null;
  private sequence = 0;

  begin(input: Omit<Pending, "attemptId" | "phase">): number {
    const attemptId = ++this.sequence;
    this.pending = { ...input, attemptId, phase: "waiting" };
    return attemptId;
  }

  next(input: {
    ready: boolean;
    eventDishIds: readonly string[];
    demandRevision: string;
  }): { attemptId: number; savedLines: number } | null {
    const pending = this.pending;
    if (!pending || pending.phase !== "waiting" || !input.ready) return null;
    const observed = new Set(input.eventDishIds);
    if (pending.savedDishIds.some((id) => !observed.has(id))) return null;
    if (
      pending.expectsDemandChange &&
      input.demandRevision === pending.baselineDemandRevision
    )
      return null;
    pending.phase = "in_flight";
    return {
      attemptId: pending.attemptId,
      savedLines: pending.savedDishIds.length,
    };
  }

  failed(attemptId: number) {
    if (this.pending?.attemptId === attemptId) this.pending.phase = "failed";
  }

  retry() {
    if (this.pending?.phase === "failed") this.pending.phase = "waiting";
  }

  succeeded(attemptId: number) {
    if (this.pending?.attemptId === attemptId) this.pending = null;
  }

  status(): { attemptId?: number; phase: Phase; savedLines: number } {
    return this.pending
      ? {
          attemptId: this.pending.attemptId,
          phase: this.pending.phase,
          savedLines: this.pending.savedDishIds.length,
        }
      : { phase: "complete", savedLines: 0 };
  }
}
