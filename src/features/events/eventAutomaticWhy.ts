import type {
  AutomaticExplanation,
  AutomaticKind,
  AutomaticOrigin,
} from "../../lib/automaticExplanation";

/** Plain catering names for each part of the event Capsule fills in. */
const KIND_LABEL: Record<AutomaticKind, string> = {
  proposal_line: "Proposal lines",
  timeline_milestone: "Timeline steps",
  planning_answer: "Planning answers",
  task: "Prep tasks",
  purchasing: "Ingredients to buy",
  staffing_need: "Crew needs",
  pack_line: "Pack list",
};

const KIND_ORDER: AutomaticKind[] = [
  "proposal_line",
  "timeline_milestone",
  "planning_answer",
  "staffing_need",
  "task",
  "purchasing",
  "pack_line",
];

export const ORIGIN_LABEL: Record<AutomaticOrigin, string> = {
  generated: "Made by Capsule",
  manual: "Added by a person",
  overridden: "Changed by a person",
};

/** Items that need a person: blocked first, then out of date. */
export const needsAttention = (item: AutomaticExplanation) =>
  item.blocking != null || item.stale;

const rank = (item: AutomaticExplanation) =>
  item.blocking != null ? 0 : item.stale ? 1 : 2;

export type AutomaticWhyGroup = {
  kind: AutomaticKind;
  label: string;
  items: AutomaticExplanation[];
  attention: number;
};

/** One group per part of the event, in work order; inside a group the items
 * that need a person come first, the rest keep the order Capsule sent. */
export function groupAutomaticWhy(
  items: readonly AutomaticExplanation[],
): AutomaticWhyGroup[] {
  return KIND_ORDER.flatMap((kind) => {
    const rows = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === kind)
      .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
      .map(({ item }) => item);
    if (rows.length === 0) return [];
    return [
      {
        kind,
        label: KIND_LABEL[kind],
        items: rows,
        attention: rows.filter(needsAttention).length,
      },
    ];
  });
}

/** Plain names for the records an automatic item can come from. */
const SOURCE_LABEL: Record<string, string> = {
  components: "a recipe part",
  dishComponents: "a dish's recipe",
  dishIngredients: "a dish's ingredients",
  dishTasks: "a dish's prep steps",
  dishes: "a dish",
  eventDishes: "the event menu",
  events: "the event details",
  ingredientDemands: "the ingredient totals",
  ingredients: "an ingredient",
  packListTemplates: "a pack list template",
  packLists: "the pack list",
  planningRules: "a planning rule",
  productionBatches: "a cooking batch",
  proposals: "the proposal",
  serviceStyleKitItems: "the service style kit",
  staffingTemplates: "a crew template",
};

/** "Comes from the event menu and a dish; rule proposal-plan v2." — always
 * says something, so a person never wonders whether the line was left out. */
export function sourceLine(
  item: Pick<AutomaticExplanation, "sources" | "ruleVersion" | "origin">,
): string {
  const names = [
    ...new Set(
      item.sources.map((s) => SOURCE_LABEL[s.table] ?? "another record"),
    ),
  ];
  const from =
    names.length > 0
      ? `Comes from ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}`
      : item.origin === "manual"
        ? "A person added this by hand"
        : "Capsule did not keep what this came from";
  const rule = item.ruleVersion
    ? `rule ${item.ruleVersion}`
    : "not made from a saved rule";
  return `${from}; ${rule}.`;
}

/** "Last brought up to date 3 Oct, 14:05" in the viewer's own time. */
export function lastUpdatedLine(at: number | null): string {
  if (at == null) return "Capsule has not brought this up to date yet.";
  return `Last brought up to date ${new Date(at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}.`;
}
