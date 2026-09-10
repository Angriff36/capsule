import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthContext, requireTenant } from "./authContext";
import { prepWorkBalance } from "../../src/lib/prepWorkBalance";

export interface PrepWorkReconciliationResult {
  created: number;
  updated: number;
  unresolved: {
    dishTaskId: string;
    name: string;
    taskIds: string[];
    reason: string;
  }[];
  notice?: string;
}

interface WorkPlan {
  template: Doc<"dishTasks">;
  stepTasks: Doc<"prepTasks">[];
  balance: Extract<ReturnType<typeof prepWorkBalance>, { kind: "resolved" }>;
  target?: Doc<"prepTasks">;
  prior?: Doc<"prepTasks">;
  dependencies: {
    record: Doc<"prepTaskDependencies">;
    predecessor: Doc<"prepTasks"> | null;
  }[];
}

interface ReconciliationPlan {
  selection: Doc<"eventDishes">;
  event: Doc<"events">;
  result: PrepWorkReconciliationResult;
  plans: WorkPlan[];
}

/** One read-only plan shared by automatic writes and the operator review. */
async function planEventPrepWork(
  ctx: QueryCtx,
  args: { eventDishId: Id<"eventDishes"> },
): Promise<ReconciliationPlan> {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const selection = await ctx.db.get(args.eventDishId);
  const event = selection ? await ctx.db.get(selection.eventId) : null;
  if (
    !selection ||
    selection.tenantId !== tenantId ||
    selection.deletedAt != null ||
    selection.removedAt != null ||
    !event ||
    event.tenantId !== tenantId ||
    event.deletedAt != null
  )
    throw new Error("Active event menu line not found");
  if (["completed", "closed_out", "cancelled"].includes(event.stage))
    return {
      selection,
      event,
      plans: [],
      result: {
        created: 0,
        updated: 0,
        unresolved: [],
        notice: "Historical prep has been preserved.",
      },
    };

  // Generated queries and commands retain the Manifest kitchen/manage policies.
  // Both indexed queries return this complete parent scope, not a tenant-wide cap.
  const templates: Doc<"dishTasks">[] = await ctx.runQuery(
    api.queries.listDishTaskByDishId,
    { dishId: selection.dishId },
  );
  const tasks: Doc<"prepTasks">[] = await ctx.runQuery(
    api.queries.listPrepTaskByEventDishId,
    { eventDishId: selection._id },
  );
  const result: PrepWorkReconciliationResult = {
    created: 0,
    updated: 0,
    unresolved: [],
  };
  const plans: WorkPlan[] = [];
  for (const template of templates) {
    if (
      template.tenantId !== tenantId ||
      template.deletedAt != null ||
      template.status !== "active"
    )
      continue;
    const stepTasks = tasks.filter(
      (task) =>
        task.tenantId === tenantId &&
        task.eventId === event._id &&
        task.eventDishId === selection._id &&
        task.dishTaskId === template._id &&
        task.deletedAt == null &&
        task.status !== "cancelled",
    );
    // An old prepared component/ingredient is not automatically credit for a
    // replacement recipe merely because its task name or unit stayed the same.
    const changedRecipe = stepTasks.filter(
      (task) =>
        task.status === "completed" &&
        ((task.componentId ?? null) !== (template.componentId ?? null) ||
          (task.ingredientId ?? null) !== (template.ingredientId ?? null)),
    );
    const unit = template.defaultUnit ?? "portion";
    const requiredQuantity =
      (template.defaultQuantity ?? 1) * selection.quantityServings;
    const balance = prepWorkBalance(
      requiredQuantity,
      unit,
      stepTasks.map((task) => ({ ...task, id: task._id })),
    );
    if (changedRecipe.length || balance.kind === "unresolved") {
      result.unresolved.push({
        dishTaskId: template._id,
        name: template.name,
        reason: changedRecipe.length
          ? "The recipe changed after work was completed. Check which prepared food can be used."
          : "The work and recipe quantities cannot be compared. Check their units and quantities.",
        taskIds: [
          ...new Set([
            ...changedRecipe.map((task) => task._id),
            ...(balance.kind === "unresolved" ? balance.taskIds : []),
          ]),
        ],
      });
      continue;
    }
    const target = stepTasks.find((task) => task._id === balance.targetTaskId);
    const prior = stepTasks
      .filter((task) => task.status === "completed")
      .sort(
        (a, b) =>
          (b.completedAt ?? 0) - (a.completedAt ?? 0) ||
          a._id.localeCompare(b._id),
      )[0];
    const dependencySource = target ?? prior;
    const dependencies: WorkPlan["dependencies"] = [];
    if (dependencySource) {
      const records = await ctx.db
        .query("prepTaskDependencies")
        .withIndex("by_dependentTaskId", (q) =>
          q.eq("dependentTaskId", dependencySource._id),
        )
        .collect();
      for (const record of records) {
        if (record.tenantId !== tenantId) continue;
        const predecessor = await ctx.db.get(record.predecessorTaskId);
        dependencies.push({ record, predecessor });
      }
    }
    plans.push({ template, stepTasks, balance, target, prior, dependencies });
  }

  // A completed old batch cannot satisfy an unresolved new prerequisite.
  // Propagate only through recorded dependencies, leaving unrelated work usable.
  const unresolved = new Map(
    result.unresolved.map((item) => [item.dishTaskId, item]),
  );
  const plansByTemplate = new Map(
    plans.map((plan) => [plan.template._id, plan]),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const plan of plans) {
      if (
        unresolved.has(plan.template._id) ||
        plan.balance.targetQuantity === 0
      )
        continue;
      const blockedBy = plan.dependencies.flatMap(({ predecessor }) => {
        if (
          predecessor?.eventDishId !== selection._id ||
          !predecessor.dishTaskId
        )
          return [];
        const prerequisite = unresolved.get(predecessor.dishTaskId);
        return prerequisite ? [prerequisite] : [];
      });
      // Existing dependency declarations are pending-only. Do not discover
      // that after changing quantities, or reset an underway task to attach one.
      const missingPrerequisites: Id<"prepTasks">[] = [];
      if (plan.target && plan.target.status !== "pending") {
        const linked = new Set(
          plan.dependencies.map(({ record }) => record.predecessorTaskId),
        );
        for (const { predecessor } of plan.dependencies) {
          if (
            predecessor?.eventDishId !== selection._id ||
            !predecessor.dishTaskId ||
            predecessor.dishTaskId === plan.template._id
          )
            continue;
          const prerequisite = plansByTemplate.get(predecessor.dishTaskId);
          if (!prerequisite) continue;
          if (prerequisite.balance.targetQuantity > 0 && !prerequisite.target)
            missingPrerequisites.push(predecessor._id);
          for (const task of prerequisite.stepTasks) {
            const quantity =
              task._id === prerequisite.target?._id
                ? prerequisite.balance.targetQuantity
                : task.quantity;
            if (
              task.status !== "completed" &&
              quantity > 0 &&
              !linked.has(task._id)
            )
              missingPrerequisites.push(task._id);
          }
        }
      }
      if (!blockedBy.length && !missingPrerequisites.length) continue;
      const item = {
        dishTaskId: plan.template._id,
        name: plan.template.name,
        reason: blockedBy.length
          ? "A prerequisite needs attention before this step can be updated."
          : "This step is underway and needs additional prerequisite work. Check its sequencing.",
        taskIds: [
          ...new Set([
            ...plan.stepTasks.map((task) => task._id),
            ...blockedBy.flatMap((prerequisite) => prerequisite.taskIds),
            ...missingPrerequisites,
          ]),
        ],
      };
      unresolved.set(plan.template._id, item);
      result.unresolved.push(item);
      changed = true;
    }
  }

  if (!plans.length && !result.unresolved.length)
    result.notice = "This dish has no active prep instructions.";
  return { selection, event, result, plans };
}

/** Read-only, reactive explanation of the same groups the writer leaves alone. */
export async function reviewEventPrepWork(
  ctx: QueryCtx,
  args: { eventId: Id<"events"> },
): Promise<
  {
    eventDishId: string;
    dishId: string;
    dishName: string;
    steps: PrepWorkReconciliationResult["unresolved"];
  }[]
> {
  const selections: Doc<"eventDishes">[] = await ctx.runQuery(
    api.queries.listEventDishByEventId,
    { eventId: args.eventId },
  );
  const review = [];
  for (const selection of selections) {
    if (selection.deletedAt != null || selection.removedAt != null) continue;
    const { result } = await planEventPrepWork(ctx, {
      eventDishId: selection._id,
    });
    if (!result.unresolved.length) continue;
    const dish = await ctx.db.get(selection.dishId);
    review.push({
      eventDishId: selection._id,
      dishId: selection.dishId,
      dishName: dish?.name ?? "Dish",
      steps: result.unresolved,
    });
  }
  return review;
}

/** Read, balance and apply one exact menu line in the caller's transaction. */
export async function reconcileEventPrepWork(
  ctx: MutationCtx,
  args: { eventDishId: Id<"eventDishes"> },
): Promise<PrepWorkReconciliationResult> {
  const { selection, event, result, plans } = await planEventPrepWork(
    ctx,
    args,
  );
  const tenantId = selection.tenantId;
  const unresolved = new Set(result.unresolved.map((item) => item.dishTaskId));
  const balanceTasks = new Map<string, Id<"prepTasks">>();
  const outstandingTasks = new Map<string, Id<"prepTasks">[]>();
  for (const plan of plans) {
    const { template, stepTasks, balance, target, prior } = plan;
    if (unresolved.has(template._id)) continue;
    const outstanding = stepTasks
      .filter(
        (task) =>
          task.status !== "completed" &&
          (task._id === target?._id ? balance.targetQuantity : task.quantity) >
            0,
      )
      .map((task) => task._id);
    outstandingTasks.set(template._id, outstanding);
    if (target) {
      if (balance.targetQuantity > 0)
        balanceTasks.set(template._id, target._id);
      if (target.quantity !== balance.targetQuantity) {
        await ctx.runMutation(api.mutations.PrepTask_reconcileRemainingWork, {
          docId: target._id,
          expectedVersion: target.version,
        });
        result.updated++;
      }
      continue;
    }
    if (balance.targetQuantity === 0) continue;
    // Reading the complete task group before creating provides transaction/OCC
    // conflict detection: a retry sees the row created by the first caller.
    const created: { docId: Id<"prepTasks"> } = await ctx.runMutation(
      api.mutations.PrepTask_createViaOpen,
      {
        eventDishId: selection._id,
        eventId: event._id,
        dishId: selection.dishId,
        dishTaskId: template._id,
        name: template.name,
        quantity: balance.targetQuantity,
        unit: template.defaultUnit ?? "portion",
        category: template.category,
        taskType: template.taskType,
        ...(template.componentId ? { componentId: template.componentId } : {}),
        ...(template.ingredientId
          ? { ingredientId: template.ingredientId }
          : {}),
        ...((prior?.station ?? template.station)
          ? { station: (prior?.station ?? template.station)! }
          : {}),
        ...(prior?.dueAt != null ? { dueAt: prior.dueAt } : {}),
        specialInstructions:
          prior?.specialInstructions ?? template.instructions ?? undefined,
        isGenerated: true,
      },
    );
    balanceTasks.set(template._id, created.docId);
    outstanding.push(created.docId);
    result.created++;
  }

  // Reconnect both new and existing balance rows to outstanding prerequisite
  // work, including manual work already credited by the balance calculation.
  // Old dependency edges and completed records remain intact.
  for (const plan of plans) {
    const taskId = balanceTasks.get(plan.template._id);
    if (!taskId) continue;
    const existing = await ctx.db
      .query("prepTaskDependencies")
      .withIndex("by_dependentTaskId", (q) => q.eq("dependentTaskId", taskId))
      .collect();
    const linked = new Set(
      existing
        .filter((edge) => edge.tenantId === tenantId)
        .map((edge) => edge.predecessorTaskId),
    );
    for (const { record, predecessor } of plan.dependencies) {
      const outstanding =
        predecessor?.eventDishId === selection._id &&
        predecessor.dishTaskId &&
        predecessor.dishTaskId !== plan.template._id
          ? outstandingTasks.get(predecessor.dishTaskId)
          : undefined;
      const predecessorIds = outstanding?.length
        ? outstanding
        : [record.predecessorTaskId];
      for (const predecessorId of predecessorIds) {
        if (linked.has(predecessorId)) continue;
        linked.add(predecessorId);
        await ctx.runMutation(
          api.mutations.PrepTaskDependency_createViaDeclare,
          {
            dependentTaskId: taskId,
            predecessorTaskId: predecessorId,
          },
        );
      }
    }
  }
  return result;
}
