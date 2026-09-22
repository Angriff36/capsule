// Catalog reclassification (2026-09-21): decide what an imported TPP menu row
// really is. Pure. Rules first; a Jev (TypeSafe System One) answer only fills
// what the rules leave open; nothing here reasons or writes.
// Design: docs/systems/culinary-catalog-reclassification.md.

import type { TppItemRole } from "./tppImport";

/** Where a mis-imported Dish row goes. Mirrors the design table. */
export type ReclassifyKind =
  | "food"
  | "supply"
  | "package"
  | "service"
  | "placeholder"
  | "kitchen_batch"
  | "prep_step"
  | "orphan";

export const RECLASSIFY_KINDS: readonly ReclassifyKind[] = [
  "food",
  "supply",
  "package",
  "service",
  "placeholder",
  "kitchen_batch",
  "prep_step",
  "orphan",
];

/** Jev's answer vocabulary for one catalog row (scripts/jev-menu-item-kind-probe.ts). */
export type JevRowKind =
  | "served_dish"
  | "kitchen_batch"
  | "prep_step"
  | "supply"
  | "package"
  | "service"
  | "placeholder"
  | "other";

export const JEV_CONFIDENCE_BAR = 0.8;

/**
 * Owner rule (2026-09-21): a timing tag in the name means a prep step,
 * every time. "(day of)", "(1 day prior)", "close to day of", "night before".
 */
export const TIMING_TAG =
  /\b(day of|days? prior|day before|night before|morning of)\b/i;

export const PLACEHOLDER_CATEGORY = "Choice placeholder";
export const TPP_PREP_LIST_CATEGORY = "Prep List Item";

export interface ReclassifyInput {
  name: string;
  /** TPP category from the recipe export, when the row joined. */
  tppCategory: string | null;
  /** Role from classifyTppItem over the joined TPP item, when it joined. */
  tppRole: TppItemRole | null;
  /** The row is used as a line under at least one other TPP item. */
  hasParents: boolean;
  /** The row has recipe rows of its own in TPP. */
  hasOwnRows: boolean;
  jev: { kind: JevRowKind; confidence: number } | null;
}

export interface ReclassifyDecision {
  kind: ReclassifyKind;
  /** "rule:<name>" or "jev". */
  source: string;
  confidence: number;
  /** Ready to approve in bulk; false means a person should look first. */
  ready: boolean;
  /** Category to backfill on a row that stays a Dish, when TPP had one. */
  category: string | null;
}

const JEV_TO_KIND: Record<JevRowKind, ReclassifyKind | null> = {
  served_dish: "food",
  kitchen_batch: "kitchen_batch",
  prep_step: "prep_step",
  supply: "supply",
  package: "package",
  service: "service",
  placeholder: "placeholder",
  other: null,
};

/** A prep item nothing in TPP uses and that carries no rows of its own. */
const orphanIfUnused = (
  kind: ReclassifyKind,
  input: ReclassifyInput,
): ReclassifyKind =>
  (kind === "prep_step" || kind === "kitchen_batch") &&
  !input.hasParents &&
  !input.hasOwnRows
    ? "orphan"
    : kind;

const backfillCategory = (input: ReclassifyInput): string | null => {
  const category = (input.tppCategory ?? "").trim();
  return category && category !== TPP_PREP_LIST_CATEGORY ? category : null;
};

export function decideReclassification(
  input: ReclassifyInput,
): ReclassifyDecision {
  const decided = (
    kind: ReclassifyKind,
    source: string,
    confidence = 1,
    ready = true,
  ): ReclassifyDecision => ({
    kind: orphanIfUnused(kind, input),
    source,
    confidence,
    ready,
    category:
      kind === "placeholder"
        ? PLACEHOLDER_CATEGORY
        : kind === "food" || kind === "supply" || kind === "package" || kind === "service"
          ? backfillCategory(input)
          : null,
  });

  if (TIMING_TAG.test(input.name)) return decided("prep_step", "rule:timing-tag");

  if ((input.tppCategory ?? "").trim() === TPP_PREP_LIST_CATEGORY) {
    switch (input.tppRole) {
      case "recipe":
        return decided("kitchen_batch", "rule:tpp-prep-list");
      case "supply":
        return decided("supply", "rule:tpp-prep-list");
      default:
        // portion_pattern, prep_pattern, dish (a noun-named prep item), null
        return decided("prep_step", "rule:tpp-prep-list");
    }
  }

  if (input.tppRole === "supply") return decided("supply", "rule:tpp-supply-words");

  if (input.jev) {
    const kind = JEV_TO_KIND[input.jev.kind];
    const ready = input.jev.confidence >= JEV_CONFIDENCE_BAR;
    if (kind) return decided(kind, "jev", input.jev.confidence, ready);
    return decided("food", "jev", input.jev.confidence, false);
  }

  // Rules found nothing and no model answer exists: keep it a dish, ask a person.
  return decided("food", "rule:default", 0, false);
}

/** Name key for joining the menu export, the recipe export and live records. */
export const nameKey = (name: string): string =>
  (name ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const CAPSULE_ENTITY_FOR_KIND: Record<ReclassifyKind, string> = {
  food: "dish",
  supply: "dish",
  package: "dish",
  service: "dish",
  placeholder: "dish",
  kitchen_batch: "component",
  prep_step: "dish_task",
  orphan: "dish",
};

export const RECLASSIFY_KIND_LABEL: Record<ReclassifyKind, string> = {
  food: "Real dish",
  supply: "Supply",
  package: "Package",
  service: "Service or fee",
  placeholder: "Choice placeholder",
  kitchen_batch: "Kitchen batch (recipe)",
  prep_step: "Prep step",
  orphan: "Prep item with no parent dish",
};
