import type { PrepTaskLike } from "./KitchenCommandDeckTypes";
import { runBulkItems } from "../../../ui/bulk-select";

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
    if (!KitchenPrepAssignManager.canAssign(task)) {
      throw new Error("A finished or cancelled task cannot change hands");
    }
    await this.assignFn({
      docId: task._id,
      version: task.version,
      personId,
    });
  }

  /** Live work changes hands; closed work does not. PrepTask.assign accepts
   *  pending, claimed, in-progress and blocked, and leaves a started or
   *  blocked step in that state rather than rewinding it. */
  static canAssign(task: PrepTaskLike): boolean {
    return ["pending", "claimed", "in_progress", "blocked"].includes(
      String(task.status),
    );
  }

  async assignMany(tasks: PrepTaskLike[], personId: string): Promise<number> {
    const targets = tasks.filter((t) => KitchenPrepAssignManager.canAssign(t));
    await runBulkItems(targets, (task) => this.assignOne(task, personId));
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
