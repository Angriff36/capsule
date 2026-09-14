// Revision-2 culinary model (2026-09-14) — TPP export -> suggested links.
//
// Pure mapper over the shape of work/tpp-recipes/tpp-recipes-full.json. It
// never writes. Every output is a SUGGESTION keyed by the permanent link key;
// a person approves before any Capsule record exists. The verb rule is a
// suggestion engine: "Make" stays a recipe (never demoted to "Portion"), a
// "Portion" item with one inventory row is a portioning pattern over that
// ingredient, and an empty "Make" is a recipe with both_missing content.

import { buildLinkKey } from "./importMapping";
import { resolveTppUnit, type QuantityBasis, type UnitCode, type UnitStatus } from "./units";

export interface TppRecipeRow {
  recp_RecipeSak: number;
  recphis_RecipeHistorySak?: number;
  NAME: string;
  recphis_MajorAmt: number;
  unitMeas_Description: string;
  recp_SubMenuItemSak: number | null;
  recp_InventorySak: number | null;
  prep_PrepCodeDesc?: string | null;
  Cost?: number | null;
}

export interface TppMenuItem {
  mi_MenuItemSak: number;
  mi_SubBusinessSak: number;
  mi_ItemName: string;
  mi_Description?: string | null;
  mic_Category?: string | null;
  mi_PreporatoryNotes?: string | null;
  mi_HeatingServing?: string | null;
  mi_YieldAmt: number;
  mi_YieldSak: number;
  mi_LastChangeDate?: string | null;
  mi_SubItem?: boolean | null;
  mi_RecordDeleted?: boolean | null;
  mi_DeletedDate?: string | null;
  mi_Discontinued?: boolean | null;
  RecipeCost?: number | null;
  LaborCost?: number | null;
  Recipe: TppRecipeRow[];
}

export type TppItemRole = "recipe" | "portion_pattern" | "dish" | "supply" | "prep_pattern";
export type SuggestedRecordType = "component" | "ingredient" | "dish" | "dish_ingredient" | "dish_component" | "dish_task" | "component_ingredient" | "component_component" | "dish_container";

export interface SuggestedLink {
  linkKey: string;
  sourceSystem: "tpp_legacy";
  sourceAccount: string;
  recordType: "menu_item" | "menu_item_recipe_row" | "inventory_item";
  externalId: string;
  role: string;
  ordinal: number;
  capsuleEntity: SuggestedRecordType;
  sourceVersion: string | null;
  /** Fields the import would apply (three-way baseline) */
  suggestedValues: Record<string, string | number | boolean | null | string[]>;
  notes: string[];
}

export interface ItemClassification {
  role: TppItemRole;
  verb: string;
  contentStatus: "complete" | "method_missing" | "ingredients_missing" | "both_missing" | "not_applicable";
  choiceOptions: string[] | null;
  quantityBasisHint: QuantityBasis | null;
  leadTimeMaxDaysHint: number | null;
  packagingHint: boolean;
}

const MAKE_VERBS = ["make", "cook", "marinate", "marinade", "rub", "grill", "bake", "prepare", "roast", "brine", "smoke", "proof"];
const PORTION_VERBS = ["portion", "cut", "slice", "dice", "chop", "trim", "assemble", "wrap", "pan", "sheet", "ball", "order", "clean", "snip", "shave", "mince", "blanch", "pipe"];
const SUPPLY_WORDS = /\b(bowl|bowls|lid|lids|container|packag|plasticware|place setting|servingware|plate|napkin|foil|wrap|box|bag|cup lids|utensil|chafer)\b/i;

export const classifyTppItem = (item: TppMenuItem): ItemClassification => {
  const name = item.mi_ItemName.trim();
  const lower = name.toLowerCase();
  const verb = (lower.split(/[\s/]+/)[0] ?? "").replace(/[^a-z]/g, "");
  const hasRows = item.Recipe.length > 0;
  const hasMethod = (item.mi_PreporatoryNotes ?? "").trim().length > 0;
  const category = (item.mic_Category ?? "").trim();
  const isPrepListItem = category === "Prep List Item";
  const makeOrPortion = /\bmake\s*(or|\/)\s*portion\b/i.test(name) || /\bmake\/portion\b/i.test(name);
  const chefsChoice = /chef.?s choice/i.test(name);
  const choiceOptions = makeOrPortion ? ["make", "portion"] : chefsChoice ? ["chef_selection"] : null;
  const leadTime = /(\d+)\s*days?\s*max\s*prior/i.exec(name);
  const basisHint: QuantityBasis | null = /raw weight/i.test(name) ? "raw" : /weight (in|after) cooked|cooked weight|\bcooked\b/i.test(name) ? "cooked" : null;
  const packagingHint = SUPPLY_WORDS.test(name);

  let role: TppItemRole;
  if (!isPrepListItem) role = packagingHint && !hasRows ? "supply" : "dish";
  else if (MAKE_VERBS.includes(verb)) role = "recipe";
  else if (PORTION_VERBS.includes(verb)) {
    const onlyInventory = hasRows && item.Recipe.every((r) => r.recp_InventorySak != null);
    role = hasRows && onlyInventory && item.Recipe.length === 1 ? "portion_pattern" : hasRows ? "recipe" : "prep_pattern";
  } else role = hasRows ? "recipe" : "prep_pattern";

  const contentStatus =
    role === "recipe"
      ? hasRows && hasMethod
        ? "complete"
        : hasRows
          ? "method_missing"
          : hasMethod
            ? "ingredients_missing"
            : "both_missing"
      : "not_applicable";
  return {
    role,
    verb,
    contentStatus,
    choiceOptions,
    quantityBasisHint: basisHint,
    leadTimeMaxDaysHint: leadTime ? Number(leadTime[1]) : null,
    packagingHint,
  };
};

const account = (item: TppMenuItem) => String(item.mi_SubBusinessSak);

const rowBasis = (row: TppRecipeRow, hint: QuantityBasis | null): QuantityBasis => {
  if (hint) return hint;
  if (row.recp_InventorySak != null) return "as_purchased";
  if (row.recp_SubMenuItemSak != null) return "as_produced";
  return "unknown";
};

export interface RowUnit {
  unit: UnitCode | null;
  status: UnitStatus;
  sourceLabel: string;
}

export const rowUnit = (row: TppRecipeRow): RowUnit => resolveTppUnit(row.unitMeas_Description);

/**
 * Suggested links for one TPP item and its rows. Requires the catalog of
 * items (by sak) to know whether a sub-item is a recipe or a portion pattern.
 */
export function suggestLinksForItem(item: TppMenuItem, catalog: ReadonlyMap<number, TppMenuItem>): SuggestedLink[] {
  const cls = classifyTppItem(item);
  const acct = account(item);
  const version = item.mi_LastChangeDate ?? null;
  const links: SuggestedLink[] = [];
  const base = { sourceSystem: "tpp_legacy" as const, sourceAccount: acct, sourceVersion: version };
  const itemKey = (role: string, ordinal = 0) =>
    buildLinkKey({ sourceSystem: "tpp_legacy", sourceAccount: acct, recordType: "menu_item", externalId: String(item.mi_MenuItemSak), role, ordinal });
  const rowKey = (row: TppRecipeRow, role: string, ordinal = 0) =>
    buildLinkKey({ sourceSystem: "tpp_legacy", sourceAccount: acct, recordType: "menu_item_recipe_row", externalId: String(row.recp_RecipeSak), role, ordinal });

  if (cls.role === "recipe") {
    links.push({
      ...base,
      linkKey: itemKey("recipe"),
      recordType: "menu_item",
      externalId: String(item.mi_MenuItemSak),
      role: "recipe",
      ordinal: 0,
      capsuleEntity: "component",
      suggestedValues: {
        name: item.mi_ItemName.trim(),
        instructions: (item.mi_PreporatoryNotes ?? "").trim() || null,
        yieldQuantity: item.mi_YieldAmt,
        yieldUnitSak: item.mi_YieldSak,
        contentStatus: cls.contentStatus,
        laborCostNote: item.LaborCost != null ? String(item.LaborCost) : null,
      },
      notes: [
        cls.contentStatus === "both_missing" ? "recipe has no ingredients and no method on file; cost unknown" : cls.contentStatus === "method_missing" ? "method not on file" : cls.contentStatus === "ingredients_missing" ? "ingredients not on file" : "",
        /drive recipe/i.test(item.mi_ItemName) ? "method lives in Google Drive, not on file" : "",
        cls.leadTimeMaxDaysHint != null ? `suggested leadTimeMaxDays=${cls.leadTimeMaxDaysHint} from the name; needs approval` : "",
      ].filter(Boolean),
    });
    for (const row of item.Recipe) {
      const unit = rowUnit(row);
      if (row.recp_InventorySak != null) {
        links.push({
          ...base,
          linkKey: rowKey(row, "recipe_line"),
          recordType: "menu_item_recipe_row",
          externalId: String(row.recp_RecipeSak),
          role: "recipe_line",
          ordinal: 0,
          capsuleEntity: "component_ingredient",
          suggestedValues: { ingredientSak: row.recp_InventorySak, quantity: row.recphis_MajorAmt, unit: unit.unit, unitStatus: unit.status, sourceUnit: unit.sourceLabel, quantityBasis: rowBasis(row, cls.quantityBasisHint) },
          notes: unit.unit ? [] : [`unit "${unit.sourceLabel}" ${unit.status}`],
        });
      } else if (row.recp_SubMenuItemSak != null) {
        const child = catalog.get(row.recp_SubMenuItemSak);
        const childRole = child ? classifyTppItem(child).role : "recipe";
        links.push({
          ...base,
          linkKey: rowKey(row, "recipe_line"),
          recordType: "menu_item_recipe_row",
          externalId: String(row.recp_RecipeSak),
          role: "recipe_line",
          ordinal: 0,
          capsuleEntity: childRole === "portion_pattern" ? "component_ingredient" : "component_component",
          suggestedValues: { childMenuItemSak: row.recp_SubMenuItemSak, quantity: row.recphis_MajorAmt, unit: unit.unit, unitStatus: unit.status, sourceUnit: unit.sourceLabel, quantityBasis: "as_produced" },
          notes: childRole === "portion_pattern" ? ["sub-item is a portioning pattern; line resolves to its ingredient"] : [],
        });
      }
    }
    return links;
  }

  if (cls.role === "portion_pattern") {
    const row = item.Recipe[0];
    links.push({
      ...base,
      linkKey: itemKey("portion_pattern"),
      recordType: "menu_item",
      externalId: String(item.mi_MenuItemSak),
      role: "portion_pattern",
      ordinal: 0,
      capsuleEntity: "ingredient",
      suggestedValues: { ingredientSak: row.recp_InventorySak, passThrough: true, name: item.mi_ItemName.trim() },
      notes: ["no recipe created; dish rows that use this item resolve to the ingredient plus a portioning step"],
    });
    return links;
  }

  if (cls.role === "prep_pattern") {
    links.push({
      ...base,
      linkKey: itemKey("prep_pattern"),
      recordType: "menu_item",
      externalId: String(item.mi_MenuItemSak),
      role: "prep_pattern",
      ordinal: 0,
      capsuleEntity: "dish_task",
      suggestedValues: { name: item.mi_ItemName.trim(), materialStatus: "source_not_identified", choiceOptions: cls.choiceOptions },
      notes: ["no rows and no method: prep step with no identified material; a person names the source"],
    });
    return links;
  }

  // dish or supply
  links.push({
    ...base,
    linkKey: itemKey("dish"),
    recordType: "menu_item",
    externalId: String(item.mi_MenuItemSak),
    role: "dish",
    ordinal: 0,
    capsuleEntity: "dish",
    suggestedValues: {
      name: item.mi_ItemName.trim(),
      description: (item.mi_Description ?? "").trim() || null,
      category: (item.mic_Category ?? "").trim() || null,
      serviceInstructions: (item.mi_HeatingServing ?? "").trim() || null,
      kind: cls.role === "supply" ? "supply" : "food",
      portionSize: item.mi_YieldAmt,
      portionUnitSak: item.mi_YieldSak,
    },
    notes: [],
  });
  for (const row of item.Recipe) {
    const unit = rowUnit(row);
    const child = row.recp_SubMenuItemSak != null ? catalog.get(row.recp_SubMenuItemSak) : null;
    const childCls = child ? classifyTppItem(child) : null;
    const isSupplyRow = SUPPLY_WORDS.test(row.NAME);
    if (row.recp_InventorySak != null) {
      links.push({
        ...base,
        linkKey: rowKey(row, "food_requirement"),
        recordType: "menu_item_recipe_row",
        externalId: String(row.recp_RecipeSak),
        role: "food_requirement",
        ordinal: 0,
        capsuleEntity: isSupplyRow ? "dish_container" : "dish_ingredient",
        suggestedValues: { ingredientSak: row.recp_InventorySak, quantity: row.recphis_MajorAmt, unit: unit.unit, unitStatus: unit.status, sourceUnit: unit.sourceLabel, quantityBasis: rowBasis(row, cls.quantityBasisHint) },
        notes: [],
      });
      continue;
    }
    if (!child || !childCls) continue;
    if (childCls.role === "portion_pattern") {
      const source = child.Recipe[0];
      links.push({
        ...base,
        linkKey: rowKey(row, "food_requirement"),
        recordType: "menu_item_recipe_row",
        externalId: String(row.recp_RecipeSak),
        role: "food_requirement",
        ordinal: 0,
        capsuleEntity: "dish_ingredient",
        suggestedValues: { ingredientSak: source.recp_InventorySak, quantity: row.recphis_MajorAmt, unit: unit.unit, unitStatus: unit.status, sourceUnit: unit.sourceLabel, quantityBasis: rowBasis(source, childCls.quantityBasisHint), viaMenuItemSak: child.mi_MenuItemSak },
        notes: ["pass-through portion pattern: consumes the ingredient in its purchase state"],
      });
      links.push({
        ...base,
        linkKey: rowKey(row, "prep_step"),
        recordType: "menu_item_recipe_row",
        externalId: String(row.recp_RecipeSak),
        role: "prep_step",
        ordinal: 0,
        capsuleEntity: "dish_task",
        suggestedValues: { name: child.mi_ItemName.trim(), stage: "kitchen", workQuantity: row.recphis_MajorAmt, workUnit: unit.unit, materialRole: "food_requirement" },
        notes: [],
      });
      continue;
    }
    if (childCls.role === "recipe") {
      links.push({
        ...base,
        linkKey: rowKey(row, "food_requirement"),
        recordType: "menu_item_recipe_row",
        externalId: String(row.recp_RecipeSak),
        role: "food_requirement",
        ordinal: 0,
        capsuleEntity: "dish_component",
        suggestedValues: { componentMenuItemSak: child.mi_MenuItemSak, quantity: row.recphis_MajorAmt, unit: unit.unit, unitStatus: unit.status, sourceUnit: unit.sourceLabel, quantityBasis: "as_produced", recipeContentStatus: childCls.contentStatus },
        notes: childCls.contentStatus === "both_missing" ? ["recipe has no content on file; requirement kept, cost unknown"] : [],
      });
      // The MAKE work stays a making step linked to the recipe requirement.
      links.push({
        ...base,
        linkKey: rowKey(row, "prep_step"),
        recordType: "menu_item_recipe_row",
        externalId: String(row.recp_RecipeSak),
        role: "prep_step",
        ordinal: 0,
        capsuleEntity: "dish_task",
        suggestedValues: {
          name: child.mi_ItemName.trim(),
          stage: "kitchen",
          workQuantity: row.recphis_MajorAmt,
          workUnit: unit.unit,
          materialRole: "food_requirement",
          componentMenuItemSak: child.mi_MenuItemSak,
          resolution: childCls.choiceOptions ? "choice_pending" : childCls.contentStatus === "complete" ? "resolved" : "content_missing",
          choiceOptions: childCls.choiceOptions,
          leadTimeMaxDays: childCls.leadTimeMaxDaysHint,
        },
        notes: childCls.choiceOptions ? [`choice pending: ${childCls.choiceOptions.join(" / ")}`] : [],
      });
      continue;
    }
    // prep_pattern child: a step with no identified material
    links.push({
      ...base,
      linkKey: rowKey(row, "prep_step"),
      recordType: "menu_item_recipe_row",
      externalId: String(row.recp_RecipeSak),
      role: "prep_step",
      ordinal: 0,
      capsuleEntity: "dish_task",
      suggestedValues: { name: child.mi_ItemName.trim(), stage: "kitchen", workQuantity: row.recphis_MajorAmt, workUnit: unit.unit, materialStatus: "source_not_identified", choiceOptions: childCls.choiceOptions, resolution: childCls.choiceOptions ? "choice_pending" : "content_missing" },
      notes: ["no material identified in the source"],
    });
  }
  return links;
}
