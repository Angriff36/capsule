/**
 * The kitchen, purchasing, crew and packing half of the automatic record
 * explanations (spec BE-18.7, AC-642). Types and the sales / timeline /
 * planning half live in ./automaticExplanation.ts. Pure.
 */
import {
  explainPackLine,
  type PackLineFacts,
} from "../features/logistics/packLineExplanation";
import { unresolvedReason, type PackReadinessLine } from "./packReadiness";
import { parsePackSources } from "./packRules";
import {
  clock,
  show,
  src,
  type AutomaticExplanation,
  type AutomaticOrigin,
} from "./automaticExplanation";

// ---------------------------------------------------------------- prep task

export type PrepTaskRow = {
  _id: string;
  version: number;
  name: string;
  eventDishId: string;
  dishId?: string | null;
  dishTaskId?: string | null;
  componentId?: string | null;
  ingredientDemandId?: string | null;
  isGenerated: boolean;
  recipeTemplateVersion?: number | null;
  recipeTemplateName?: string | null;
  quantity: number;
  unit: string;
  status: string;
  templateRetiredAt?: number | null;
  blockReason?: string | null;
  overrideOfDishTaskId?: string | null;
  overrideReason?: string | null;
  resolution?: string | null;
};

export function explainPrepTask(input: {
  row: PrepTaskRow;
  lastReconciledAt: number | null;
  unresolved: string | null;
}): AutomaticExplanation {
  const { row } = input;
  // Capsule only makes tasks from a dish's recipe steps, so every made task
  // links one; isGenerated alone defaults to true on a hand-opened task.
  const origin: AutomaticOrigin =
    row.overrideOfDishTaskId != null
      ? "overridden"
      : row.dishTaskId == null
        ? "manual"
        : row.isGenerated
          ? "generated"
          : "overridden";
  const blockingReason =
    row.status === "blocked"
      ? (row.blockReason ?? "This task is blocked.")
      : row.resolution === "choice_pending"
        ? "The recipe offers a choice nobody has made yet."
        : row.resolution === "content_missing"
          ? "The recipe step has no instructions yet."
          : input.unresolved;
  const action =
    row.status === "blocked"
      ? "PrepTask.unblock"
      : row.resolution === "choice_pending"
        ? "PrepTask.resolveChoice"
        : "PrepTask.revise";
  return {
    kind: "task",
    id: row._id,
    version: row.version,
    label: row.name,
    value: `${show(row.quantity)} ${row.unit}`,
    status: row.status,
    origin,
    sources: [
      ...src("eventDishes", row.eventDishId),
      ...src("dishes", row.dishId),
      ...src("dishTasks", row.dishTaskId ?? row.overrideOfDishTaskId),
      ...src("components", row.componentId),
      ...src("ingredientDemands", row.ingredientDemandId),
    ],
    ruleVersion:
      row.recipeTemplateVersion != null
        ? `recipe step version ${row.recipeTemplateVersion}`
        : null,
    why:
      origin === "manual"
        ? "A person added this task by hand."
        : origin === "overridden"
          ? `Made from the dish's recipe steps, then changed by a person${
              row.overrideReason ? `: ${row.overrideReason}` : "."
            }`
          : `Made from the dish's recipe step${
              row.recipeTemplateName ? ` "${row.recipeTemplateName}"` : ""
            } for ${show(row.quantity)} ${row.unit}.`,
    stale: row.templateRetiredAt != null,
    staleReason:
      row.templateRetiredAt != null
        ? "The recipe step this came from was taken out."
        : null,
    lastReconciledAt: input.lastReconciledAt,
    blocking: blockingReason ? { reason: blockingReason, action } : null,
  };
}

// ---------------------------------------------------------------- purchasing

export type ContributionRow = {
  _id: string;
  version: number;
  eventDishId: string;
  dishId: string;
  ingredientId: string;
  ingredientName?: string | null;
  quantity: number;
  unit: string;
  servings: number;
  quantityPerServing?: number | null;
  sourceKey?: string | null;
  sourceDishIngredientId?: string | null;
  sourceDishComponentId?: string | null;
  productionBatchId?: string | null;
  unitStatus?: string | null;
  supersededAt?: number | null;
  recordedAt?: number | null;
};

export function explainContribution(input: {
  row: ContributionRow;
  lastReconciledAt: number | null;
}): AutomaticExplanation {
  const { row } = input;
  const name = row.ingredientName ?? "This ingredient";
  const perServing =
    row.quantityPerServing != null
      ? `${show(row.servings)} servings x ${show(row.quantityPerServing)} ${row.unit} = ${show(row.quantity)} ${row.unit}`
      : `${show(row.quantity)} ${row.unit} for ${show(row.servings)} servings`;
  const unitProblem =
    row.unitStatus != null &&
    row.unitStatus !== "ok" &&
    row.unitStatus !== "resolved"
      ? `The unit for ${name.toLowerCase()} could not be matched (${row.unitStatus.replace(/_/g, " ")}).`
      : null;
  return {
    kind: "purchasing",
    id: row._id,
    version: row.version,
    label: name,
    value: `${show(row.quantity)} ${row.unit}`,
    status: row.supersededAt != null ? "replaced" : "current",
    origin: row.sourceKey ? "generated" : "manual",
    sources: [
      ...src("eventDishes", row.eventDishId),
      ...src("dishes", row.dishId),
      ...src("ingredients", row.ingredientId),
      ...src("dishIngredients", row.sourceDishIngredientId),
      ...src("dishComponents", row.sourceDishComponentId),
      ...src("productionBatches", row.productionBatchId),
    ],
    ruleVersion: row.sourceKey ? `recipe line ${row.sourceKey}` : null,
    why: row.sourceKey
      ? `From the dish recipe: ${perServing}.`
      : `Recorded by hand: ${perServing}.`,
    stale: row.supersededAt != null,
    staleReason:
      row.supersededAt != null
        ? "The menu or recipe changed and a newer amount replaced this one."
        : null,
    lastReconciledAt: input.lastReconciledAt ?? row.recordedAt ?? null,
    blocking: unitProblem
      ? { reason: unitProblem, action: "Ingredient.updateDetails" }
      : null,
  };
}

// ---------------------------------------------------------------- staffing

export type StaffNeedRow = {
  _id: string;
  version: number;
  role: string;
  status: string;
  startsAt?: number | null;
  followsEventTiming?: boolean | null;
  staffingTemplateId?: string | null;
  templateLineKey?: string | null;
  templateSlot?: number | null;
};

export type StaffingTemplateRow = {
  _id: string;
  version: number;
  name: string;
  retiredAt?: number | null;
};

export function explainStaffNeed(input: {
  row: StaffNeedRow;
  eventId: string;
  template: StaffingTemplateRow | null;
  /** When the event says crew start now (staff on). */
  crewStartsAt: number | null;
  lastReconciledAt: number | null;
  unresolved: string | null;
}): AutomaticExplanation {
  const { row, template } = input;
  const fromTemplate = row.staffingTemplateId != null;
  const origin: AutomaticOrigin = !fromTemplate
    ? "manual"
    : row.followsEventTiming === false
      ? "overridden"
      : "generated";
  const timeMoved =
    row.followsEventTiming !== false &&
    input.crewStartsAt != null &&
    (row.startsAt ?? null) !== input.crewStartsAt;
  const staleReason =
    template?.retiredAt != null
      ? `The crew plan "${template.name}" was retired.`
      : timeMoved
        ? `The event's crew start is now ${clock(input.crewStartsAt)}.`
        : null;
  return {
    kind: "staffing_need",
    id: row._id,
    version: row.version,
    label: row.role,
    value: clock(row.startsAt),
    status: row.status,
    origin,
    sources: [
      ...src("events", input.eventId),
      ...src("staffingTemplates", row.staffingTemplateId),
    ],
    ruleVersion: template ? `crew plan version ${template.version}` : null,
    why: !fromTemplate
      ? "A person posted this crew spot by hand."
      : `From the crew plan "${template?.name ?? "removed plan"}"${
          row.templateSlot != null ? `, spot ${row.templateSlot}` : ""
        }.${origin === "overridden" ? " A person set its own time." : ""}`,
    stale: staleReason != null,
    staleReason,
    lastReconciledAt: input.lastReconciledAt,
    blocking:
      input.unresolved != null
        ? { reason: input.unresolved, action: "EventStaffNeed.planTiming" }
        : row.status === "open"
          ? {
              reason: "Nobody has this spot yet.",
              action: "EventStaffNeed.fill",
            }
          : null,
  };
}

// ---------------------------------------------------------------- pack line

export type PackLineAutoRow = PackLineFacts &
  PackReadinessLine & {
    _id: string;
    version: number;
    packListId: string;
    packedQuantity: number;
    eventDishId?: string | null;
  };

export function explainPackLineAuto(input: {
  row: PackLineAutoRow;
  lastReconciledAt: number | null;
}): AutomaticExplanation {
  const { row } = input;
  const facts = explainPackLine(row);
  const made =
    row.generationKey != null ||
    row.serviceStyleKitItemId != null ||
    row.dishContainerId != null ||
    row.packListTemplateId != null;
  const handSet =
    row.followsDishServings === false ||
    (row.generatedQuantity != null &&
      Number(row.generatedQuantity) !== Number(row.requiredQuantity)) ||
    row.excludedAt != null;
  const blocking = unresolvedReason(row);
  return {
    kind: "pack_line",
    id: row._id,
    version: row.version,
    label: row.description,
    value: `${show(row.requiredQuantity)} ${row.unit}`,
    status: String(row.status),
    origin: !made ? "manual" : handSet ? "overridden" : "generated",
    sources: [
      ...src("packLists", row.packListId),
      ...src("eventDishes", row.eventDishId),
      ...parsePackSources(row.sourcesJson).map((source) => ({
        table: source.sourceType,
        id: source.sourceId,
      })),
      ...src("packListTemplates", row.packListTemplateId),
      ...src("serviceStyleKitItems", row.serviceStyleKitItemId),
    ],
    ruleVersion:
      parsePackSources(row.sourcesJson)
        .filter((source) => source.ruleVersion != null)
        .map((source) => `rule version ${source.ruleVersion}`)[0] ??
      (row.templateVersion != null
        ? `template version ${row.templateVersion}`
        : null),
    why: [facts.origin, ...facts.reasons, ...facts.details].join(". "),
    stale: row.retiredAt != null,
    staleReason:
      row.retiredAt != null
        ? "Nothing on the event asks for this any more."
        : null,
    lastReconciledAt: input.lastReconciledAt,
    blocking: blocking
      ? {
          reason: blocking,
          action:
            String(row.status) === "missing"
              ? "PackListItem.recordSentInstead"
              : "PackListItem.exclude",
        }
      : null,
  };
}
