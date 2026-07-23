import type { PrepTaskLike } from "./KitchenCommandDeckTypes";

type AssignFn = (args: {
  docId: string;
  version: number;
  personId: string;
}) => Promise<unknown>;

type ReleaseFn = (args: { docId: string; version: number }) => Promise<unknown>;

type SimpleFn = (args: { docId: string; version: number }) => Promise<unknown>;

/**
 * Orchestrates prep ownership changes for the command deck.
 * Whole-dish assign = assign every assignable task under that EventDish.
 */
export class KitchenPrepAssignManager {
  constructor(
    private readonly assignFn: AssignFn,
    private readonly releaseFn: ReleaseFn,
    private readonly claimFn: SimpleFn,
    private readonly startFn: SimpleFn,
    private readonly completeFn: SimpleFn,
  ) {}

  async assignOne(task: PrepTaskLike, personId: string): Promise<void> {
    if (task.status !== "pending" && task.status !== "claimed") {
      throw new Error("Only pending or claimed tasks can be assigned");
    }
    await this.assignFn({
      docId: task._id,
      version: task.version,
      personId,
    });
  }

  async assignMany(tasks: PrepTaskLike[], personId: string): Promise<number> {
    const targets = tasks.filter(
      (t) => t.status === "pending" || t.status === "claimed",
    );
    for (const task of targets) {
      await this.assignOne(task, personId);
    }
    return targets.length;
  }

  async releaseOne(task: PrepTaskLike): Promise<void> {
    if (task.status !== "claimed") {
      throw new Error("Only claimed tasks can be released");
    }
    await this.releaseFn({ docId: task._id, version: task.version });
  }

  async claimOne(task: PrepTaskLike): Promise<void> {
    await this.claimFn({ docId: task._id, version: task.version });
  }

  async startOne(task: PrepTaskLike): Promise<void> {
    await this.startFn({ docId: task._id, version: task.version });
  }

  async completeOne(task: PrepTaskLike): Promise<void> {
    if (task.status !== "in_progress") {
      throw new Error("Start the task before marking it complete");
    }
    await this.completeFn({ docId: task._id, version: task.version });
  }
}
