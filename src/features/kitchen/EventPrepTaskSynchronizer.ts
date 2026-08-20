import type {
  EventPrepDemand,
  EventPrepDish,
  EventPrepDishIngredient,
  EventPrepDishTask,
  EventPrepSyncResult,
  EventPrepTask,
  EventPrepUnit,
} from "./EventPrepCoordinator";

type DemandInput = {
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: EventPrepUnit;
  servings?: number;
  dishId?: string;
  idempotencyKey?: string;
};

type TaskInput = {
  eventDishId: string;
  eventId: string;
  name: string;
  quantity: number;
  unit: EventPrepUnit;
  ingredientId?: string;
  ingredientDemandId?: string;
  componentId?: string;
  dishTaskId?: string;
  dishId: string;
  category?: string;
  taskType?: string;
  specialInstructions?: string;
  isGenerated: true;
  idempotencyKey?: string;
};

type Ports = {
  createDemand?: (input: DemandInput) => Promise<{ docId: string }>;
  confirmDemand?: (input: {
    docId: string;
    version: number;
    idempotencyKey?: string;
  }) => Promise<unknown>;
  recalculateDemand?: (input: {
    docId: string;
    version: number;
    newQuantity: number;
    reason: string;
  }) => Promise<unknown>;
  createTask?: (input: TaskInput) => Promise<{ docId: string }>;
  refreshGeneratedTask?: (input: {
    docId: string;
    version?: number;
    quantity: number;
    specialInstructions?: string;
  }) => Promise<unknown>;
};

type SyncInput = {
  eventDish: EventPrepDish;
  templates: readonly EventPrepDishTask[];
  tasks: readonly EventPrepTask[];
  demands: readonly EventPrepDemand[];
  dishIngredients?: readonly EventPrepDishIngredient[];
  skipDemand?: boolean;
};

type DemandGroup = DemandInput & { taskIds: string[] };

type PlannedItem = {
  key: string;
  template?: EventPrepDishTask;
  ingredientLine?: EventPrepDishIngredient;
  existing: EventPrepTask | undefined;
  quantity: number;
  unit: EventPrepUnit;
  name: string;
  ingredientId?: string;
  componentId?: string | null;
  category?: string;
  taskType?: string;
  instructions?: string;
};

const NO_SOURCE_REASON =
  "This dish has no prep templates and no ingredients to generate prep from.";

/** Materializes DishTask templates — or dish ingredients when no templates exist. */
export class EventPrepTaskSynchronizer {
  constructor(private readonly ports: Ports) {}

  async sync(input: SyncInput): Promise<EventPrepSyncResult> {
    const activeTemplates = input.templates
      .filter(
        (template) =>
          template.status === "active" &&
          template.dishId === input.eventDish.dishId,
      )
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
    const eventTasks = input.tasks.filter(
      (task) =>
        task.eventId === input.eventDish.eventId &&
        task.deletedAt == null &&
        task.status !== "cancelled",
    );
    const currentEventDishTasks = eventTasks.filter(
      (task) => task.eventDishId === input.eventDish.id,
    );
    const existingByTemplate = new Map(
      currentEventDishTasks
        .filter((task) => task.dishTaskId != null)
        .map((task) => [task.dishTaskId!, task] as const),
    );
    const existingByIngredient = new Map(
      currentEventDishTasks
        .filter(
          (task) =>
            task.isGenerated && task.ingredientId != null && !task.dishTaskId,
        )
        .map((task) => [task.ingredientId!, task] as const),
    );

    const planned: PlannedItem[] =
      activeTemplates.length > 0
        ? activeTemplates.map((template) => {
            const existing = existingByTemplate.get(template.id);
            const quantity = this.quantityFor(
              template,
              input.eventDish.quantityServings,
            );
            return {
              key: `template:${template.id}`,
              template,
              existing,
              quantity,
              unit: template.defaultUnit ?? ("portion" as EventPrepUnit),
              name: template.name,
              ingredientId: template.ingredientId ?? undefined,
              componentId: template.componentId,
              category: template.category ?? undefined,
              taskType: template.taskType ?? undefined,
              instructions: template.instructions ?? undefined,
            };
          })
        : (input.dishIngredients ?? [])
            .filter(
              (line) =>
                line.deletedAt == null &&
                line.dishId === input.eventDish.dishId &&
                line.quantity > 0,
            )
            .map((line) => {
              const quantity = line.quantity * input.eventDish.quantityServings;
              return {
                key: `ingredient:${line.ingredientId}`,
                ingredientLine: line,
                existing: existingByIngredient.get(line.ingredientId),
                quantity,
                unit: line.unit,
                name: `Prep ${line.name?.trim() || "ingredient"}`,
                ingredientId: line.ingredientId,
                category: "from_recipe",
                taskType: "manual",
              };
            });

    if (planned.length === 0) {
      return {
        taskCount: 0,
        demandCount: 0,
        noOpReason: NO_SOURCE_REASON,
      };
    }

    const groups = new Map<string, DemandGroup>();
    const demandIds = await this.resolveDemandIds(
      input,
      eventTasks,
      planned,
      groups,
    );

    if (!this.ports.createTask && planned.some((item) => !item.existing)) {
      throw new Error("No prep-task creator was provided");
    }
    for (const item of planned) {
      if (item.existing) {
        if (
          item.existing.isGenerated &&
          item.existing.quantity !== item.quantity &&
          this.ports.refreshGeneratedTask
        ) {
          await this.ports.refreshGeneratedTask({
            docId: item.existing.id,
            version: item.existing.version,
            quantity: item.quantity,
            specialInstructions:
              input.eventDish.specialInstructions ?? undefined,
          });
        }
        continue;
      }
      const ingredientId = item.ingredientId;
      const demandId = ingredientId
        ? demandIds.get(
            this.demandKey({
              eventId: input.eventDish.eventId,
              ingredientId,
              unit: item.unit,
            }),
          )
        : undefined;
      await this.ports.createTask!({
        eventDishId: input.eventDish.id,
        eventId: input.eventDish.eventId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        ingredientId,
        ingredientDemandId: demandId,
        componentId: item.componentId ?? undefined,
        dishTaskId: item.template?.id,
        dishId: input.eventDish.dishId,
        category: item.category,
        taskType: item.taskType,
        specialInstructions: this.instructionsFor(
          item.instructions,
          input.eventDish.specialInstructions,
        ),
        isGenerated: true,
        idempotencyKey: `event-prep:${input.eventDish.id}:${item.key}`,
      });
    }

    return { taskCount: planned.length, demandCount: groups.size };
  }

  private async resolveDemandIds(
    input: SyncInput,
    eventTasks: EventPrepTask[],
    planned: PlannedItem[],
    groups: Map<string, DemandGroup>,
  ) {
    const demandIds = new Map<string, string>();
    if (input.skipDemand) {
      for (const demand of input.demands) {
        if (
          demand.eventId !== input.eventDish.eventId ||
          demand.status === "superseded"
        ) {
          continue;
        }
        demandIds.set(
          this.demandKey({
            eventId: demand.eventId,
            ingredientId: demand.ingredientId,
            unit: demand.unit,
          }),
          demand.id,
        );
      }
      return demandIds;
    }

    for (const task of eventTasks) {
      if (!task.ingredientId || task.status === "completed") continue;
      const plannedTask = task.dishTaskId
        ? planned.find((item) => item.template?.id === task.dishTaskId)
        : undefined;
      if (task.isGenerated && plannedTask) continue;
      this.addDemandContribution(groups, {
        eventId: input.eventDish.eventId,
        ingredientId: task.ingredientId,
        requiredQuantity: task.quantity,
        unit: task.unit,
        servings: input.eventDish.quantityServings,
        dishId: input.eventDish.dishId,
        taskIds: [task.id],
      });
    }
    for (const item of planned) {
      if (!item.ingredientId) continue;
      this.addDemandContribution(groups, {
        eventId: input.eventDish.eventId,
        ingredientId: item.ingredientId,
        requiredQuantity: item.quantity,
        unit: item.unit,
        servings: input.eventDish.quantityServings,
        dishId: input.eventDish.dishId,
        taskIds: [],
      });
    }

    for (const group of groups.values()) {
      const existing = input.demands.find(
        (demand) =>
          demand.eventId === group.eventId &&
          demand.ingredientId === group.ingredientId &&
          demand.status !== "superseded",
      );
      if (existing) {
        demandIds.set(this.demandKey(group), existing.id);
        if (
          existing.requiredQuantity !== group.requiredQuantity &&
          this.ports.recalculateDemand
        ) {
          await this.ports.recalculateDemand({
            docId: existing.id,
            version: existing.version,
            newQuantity: group.requiredQuantity,
            reason: "Event dish serving quantity changed",
          });
        }
      } else {
        if (!this.ports.createDemand) {
          throw new Error(
            `No demand exists for ingredient ${group.ingredientId} and no demand creator was provided`,
          );
        }
        const { taskIds: _taskIds, ...demandInput } = group;
        demandInput.idempotencyKey = `event-prep-demand:${group.eventId}:${group.ingredientId}:${group.unit}`;
        const created = await this.ports.createDemand(demandInput);
        demandIds.set(this.demandKey(group), created.docId);
      }
    }
    return demandIds;
  }

  private quantityFor(template: EventPrepDishTask, servings: number) {
    const quantity = template.defaultQuantity ?? servings;
    if (quantity <= 0 || servings <= 0) {
      throw new Error("Event prep quantities must be positive");
    }
    return template.defaultQuantity == null ? servings : quantity * servings;
  }

  private instructionsFor(
    templateInstructions?: string | null,
    eventInstructions?: string | null,
  ) {
    return (
      [templateInstructions?.trim(), eventInstructions?.trim()]
        .filter(Boolean)
        .join("\n\n") || undefined
    );
  }

  private demandKey(
    input: Pick<DemandInput, "eventId" | "ingredientId"> & {
      unit: EventPrepUnit;
    },
  ) {
    return `${input.eventId}:${input.ingredientId}:${input.unit}`;
  }

  private addDemandContribution(
    groups: Map<string, DemandGroup>,
    contribution: DemandGroup,
  ) {
    const key = this.demandKey(contribution);
    const existing = groups.get(key);
    if (existing) {
      existing.requiredQuantity += contribution.requiredQuantity;
      existing.taskIds.push(...contribution.taskIds);
      return;
    }
    groups.set(key, { ...contribution });
  }
}
