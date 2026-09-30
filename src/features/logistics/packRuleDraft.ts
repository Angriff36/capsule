import {
  PACK_CATEGORIES,
  PACK_EVENT_FACTS,
  ruleQuantity,
} from "../../lib/packRules";
import { packCategoryLabel } from "./packLineExplanation";

export { PACK_CATEGORIES };

export const PACK_RULE_TRIGGERS = [
  { value: "dish", label: "A dish is on the menu" },
  { value: "production_note", label: "A dish note says" },
  { value: "service_style", label: "The service style is" },
  { value: "guest_count", label: "Every event (by guests)" },
  { value: "event_fact", label: "An event answer says" },
] as const;

export type PackRuleDraft = {
  trigger: string;
  dishId: string;
  serviceStyleId: string;
  matchFact: string;
  matchText: string;
  description: string;
  category: string;
  unit: string;
  baseQuantity: string;
  scaleBy: string;
  perUnits: string;
  sparePercent: string;
  ownership: string;
  returnRequired: boolean;
  returnNote: string;
  requiredCapability: boolean;
  note: string;
};

export const EMPTY_PACK_RULE_DRAFT: PackRuleDraft = {
  trigger: "dish",
  dishId: "",
  serviceStyleId: "",
  matchFact: "",
  matchText: "",
  description: "",
  category: "utensil",
  unit: "each",
  baseQuantity: "1",
  scaleBy: "fixed",
  perUnits: "",
  sparePercent: "",
  ownership: "owned",
  returnRequired: true,
  returnNote: "",
  requiredCapability: false,
  note: "",
};

export type PackRuleRow = {
  _id: string;
  version: number;
  trigger: string;
  dishId?: string | null;
  serviceStyleId?: string | null;
  matchFact?: string | null;
  matchText?: string | null;
  description: string;
  category: string;
  unit: string;
  baseQuantity: number;
  scaleBy: string;
  perUnits?: number | null;
  sparePercent: number;
  ownership: string;
  returnRequired: boolean;
  returnNote?: string | null;
  requiredCapability: boolean;
  note?: string | null;
  ruleVersion: number;
  status: unknown;
  deletedAt?: number | null;
};

function whole(raw: string): number | undefined {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value)
    ? Math.round(value)
    : undefined;
}

const text = (raw: string) => raw.trim() || undefined;

/** Command arguments for define/revise from the form. Fields the chosen
 * trigger does not read are left out. */
export function packRuleArgs(draft: PackRuleDraft) {
  const grows = draft.scaleBy !== "fixed";
  return {
    description: draft.description.trim(),
    category: draft.category,
    dishId:
      draft.trigger === "dish" || draft.trigger === "production_note"
        ? text(draft.dishId)
        : undefined,
    serviceStyleId:
      draft.trigger === "service_style"
        ? text(draft.serviceStyleId)
        : undefined,
    matchFact:
      draft.trigger === "event_fact" ? text(draft.matchFact) : undefined,
    matchText:
      draft.trigger === "event_fact" || draft.trigger === "production_note"
        ? text(draft.matchText)
        : undefined,
    unit: draft.unit,
    baseQuantity: whole(draft.baseQuantity) ?? 0,
    scaleBy: draft.scaleBy,
    perUnits: grows ? whole(draft.perUnits) : undefined,
    sparePercent: grows ? (whole(draft.sparePercent) ?? 0) : 0,
    ownership: draft.ownership,
    returnRequired: draft.returnRequired,
    returnNote: text(draft.returnNote),
    requiredCapability: draft.requiredCapability,
    note: text(draft.note),
  };
}

export function draftFromRule(rule: PackRuleRow): PackRuleDraft {
  return {
    trigger: rule.trigger,
    dishId: rule.dishId ?? "",
    serviceStyleId: rule.serviceStyleId ?? "",
    matchFact: rule.matchFact ?? "",
    matchText: rule.matchText ?? "",
    description: rule.description,
    category: rule.category,
    unit: rule.unit,
    baseQuantity: String(rule.baseQuantity),
    scaleBy: rule.scaleBy,
    perUnits: rule.perUnits != null ? String(rule.perUnits) : "",
    sparePercent: rule.sparePercent ? String(rule.sparePercent) : "",
    ownership: rule.ownership,
    returnRequired: rule.returnRequired,
    returnNote: rule.returnNote ?? "",
    requiredCapability: rule.requiredCapability,
    note: rule.note ?? "",
  };
}

/** "When" in plain words: "Chicken piccata is on the menu". */
export function describeRuleWhen(
  rule: PackRuleRow,
  names: { dish: (id: string) => string; style: (id: string) => string },
): string {
  switch (rule.trigger) {
    case "dish":
      return `${rule.dishId ? names.dish(rule.dishId) : "A dish"} is on the menu`;
    case "production_note":
      return `A ${rule.dishId ? `${names.dish(rule.dishId)} ` : "dish "}note says "${rule.matchText ?? ""}"`;
    case "service_style":
      return `The service style is ${rule.serviceStyleId ? names.style(rule.serviceStyleId) : "not set"}`;
    case "guest_count":
      return "Every event";
    case "event_fact": {
      const label =
        PACK_EVENT_FACTS.find((fact) => fact.key === rule.matchFact)?.label ??
        rule.matchFact;
      return rule.matchText?.trim()
        ? `${label} says "${rule.matchText.trim()}"`
        : `${label} is answered (not "No")`;
    }
    default:
      return rule.trigger;
  }
}

/** "How many" in plain words, with a worked example. */
export function describeRuleAmount(rule: PackRuleRow): string {
  const noun = rule.scaleBy === "servings" ? "servings" : "guests";
  if (rule.scaleBy === "fixed" || rule.perUnits == null)
    return `${rule.baseQuantity} ${rule.unit}`;
  const example = ruleQuantity(
    {
      baseQuantity: rule.baseQuantity,
      scaleBy: rule.scaleBy as "servings" | "guests",
      perUnits: rule.perUnits,
      sparePercent: rule.sparePercent,
    },
    { servings: 100, guests: 100 },
  );
  const parts = [`1 per ${rule.perUnits} ${noun}`];
  if (rule.sparePercent) parts.push(`+${rule.sparePercent}% spare`);
  if (rule.baseQuantity) parts.push(`+${rule.baseQuantity} always`);
  return `${parts.join(" ")} ${rule.unit} (100 ${noun} = ${example.quantity})`;
}

export function describeRuleOwner(rule: PackRuleRow): string {
  const owner =
    rule.ownership === "rented"
      ? "Rented"
      : rule.ownership === "client"
        ? "The client's"
        : "Ours";
  const back = rule.returnRequired
    ? rule.returnNote?.trim() || "comes back"
    : "does not come back";
  return `${packCategoryLabel(rule.category)} · ${owner} · ${back}${rule.requiredCapability ? " · Must-have" : ""}`;
}
