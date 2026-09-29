/**
 * Pack-rule planner (spec §13.2): which pack lines an event's facts ask for.
 *
 * Pure. The event reconciliation seam (convex/lib/packRuleReconciliation.ts)
 * feeds it the event, its menu, its equipment holds and the company's active
 * pack rules, then writes the answer onto the pack list.
 *
 * One planned line per item + unit + owner + return need: two dishes that
 * both need tongs make ONE tongs line that lists both dishes, so taking one
 * dish off subtracts only that dish's share. A rented chafer and our own
 * chafer stay two lines. Every source keeps its rule, rule version, the
 * numbers used and the amount, so the pack screen can answer "why 18?".
 */

export type PackRuleTrigger =
  "dish" | "production_note" | "service_style" | "guest_count" | "event_fact";
export type PackRuleScale = "fixed" | "servings" | "guests";
export type PackOwnership = "owned" | "rented" | "client";

export type PackRuleInput = {
  id: string;
  trigger: PackRuleTrigger;
  dishId?: string | null;
  serviceStyleId?: string | null;
  matchFact?: string | null;
  matchText?: string | null;
  description: string;
  category: string;
  unit: string;
  baseQuantity: number;
  scaleBy: PackRuleScale;
  perUnits?: number | null;
  sparePercent: number;
  ownership: PackOwnership;
  returnRequired: boolean;
  returnNote?: string | null;
  requiredCapability: boolean;
  ruleVersion: number;
};

export type PackDishInput = {
  eventDishId: string;
  dishId: string;
  dishName: string;
  servings: number;
  note?: string | null;
};

export type PackRentalInput = {
  reservationId: string;
  equipmentId: string;
  name: string;
  category?: string | null;
  quantity: number;
  ownership: "owned" | "rented";
};

export type PackEventInput = {
  eventId: string;
  headcount: number;
  serviceStyleId?: string | null;
  serviceStyleName?: string | null;
  /** Event and venue answers by PACK_EVENT_FACTS key. */
  facts: Record<string, string | boolean | null | undefined>;
};

export type PackSourceType = PackRuleTrigger | "rental";

export type PackSource = {
  sourceType: PackSourceType;
  sourceId: string;
  sourceLabel: string;
  ruleId: string | null;
  ruleVersion: number | null;
  formula: string;
  quantity: number;
};

export type PlannedPackLine = {
  key: string;
  description: string;
  unit: string;
  category: string;
  ownership: PackOwnership;
  returnRequired: boolean;
  returnNote: string | null;
  requiredCapability: boolean;
  quantity: number;
  sources: PackSource[];
};

/** Event and venue answers a pack rule can read, in plain words. */
export const PACK_EVENT_FACTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "barService", label: "Bar service" },
  { key: "beveragesOnMenu", label: "Drinks on the menu" },
  { key: "beverageDispensers", label: "Drink dispensers" },
  { key: "beverageTableSetup", label: "Drink table setup" },
  { key: "tablesideWater", label: "Water at the tables" },
  { key: "placeSettings", label: "Place settings" },
  { key: "mangiaDisposables", label: "Our disposables" },
  { key: "servingwareSource", label: "Where servingware comes from" },
  { key: "servingwareKit", label: "Servingware kit" },
  { key: "linenColorTables", label: "Table linen" },
  { key: "guestTableSetup", label: "Guest table setup" },
  { key: "buffetTableSetup", label: "Buffet table setup" },
  { key: "appetizerTableSetup", label: "Appetizer table setup" },
  { key: "eventRentals", label: "Event rentals" },
  { key: "decorKit", label: "Decor kit" },
  { key: "scullery", label: "Dish washing on site" },
  { key: "powerOnsite", label: "Power on site" },
  { key: "waterOnsite", label: "Water on site" },
  { key: "handwashing", label: "Handwashing" },
  { key: "venueSurface", label: "Ground at the venue" },
  { key: "tentAndFlooring", label: "Tent and flooring" },
  { key: "rainPlan", label: "Rain plan" },
  { key: "venueHasStairs", label: "Stairs at the venue" },
  { key: "venuePowerAvailable", label: "Venue has power" },
  { key: "venueWaterAccess", label: "Venue has water" },
  { key: "venueLoadIn", label: "Load-in notes" },
];

const NO_ANSWERS = new Set([
  "",
  "no",
  "n",
  "none",
  "n/a",
  "na",
  "not needed",
  "false",
  "0",
]);

function text(value: string | boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return (value ?? "").trim().toLowerCase();
}

/** An event answer matches when it contains the rule's words; a rule with no
 * words matches any answer that is not a "no". */
export function factMatches(
  value: string | boolean | null | undefined,
  matchText: string | null | undefined,
): boolean {
  const answer = text(value);
  const words = (matchText ?? "").trim().toLowerCase();
  if (words.length === 0) return !NO_ANSWERS.has(answer);
  return answer.includes(words);
}

/** Round up, and never report 4.000000001 as 5. */
function roundUp(value: number): number {
  return Math.ceil(Number(value.toFixed(6)));
}

/** Amount one rule asks for, with its working in plain words. */
export function ruleQuantity(
  rule: Pick<
    PackRuleInput,
    "baseQuantity" | "scaleBy" | "perUnits" | "sparePercent"
  >,
  amount: { servings?: number; guests?: number },
): { quantity: number; formula: string } {
  const base = Math.max(0, rule.baseQuantity);
  if (rule.scaleBy === "fixed" || rule.perUnits == null || rule.perUnits < 1)
    return { quantity: base, formula: `${base} set amount` };
  const count = Math.max(
    0,
    rule.scaleBy === "servings" ? (amount.servings ?? 0) : (amount.guests ?? 0),
  );
  const noun = rule.scaleBy === "servings" ? "servings" : "guests";
  const grown = roundUp(count / rule.perUnits);
  const spare = Math.max(0, rule.sparePercent);
  const withSpare = spare > 0 ? roundUp((grown * (100 + spare)) / 100) : grown;
  let formula = `${count} ${noun} / ${rule.perUnits} each = ${grown}`;
  if (spare > 0) formula += `, +${spare}% spare = ${withSpare}`;
  if (base > 0) formula += `, +${base} always = ${base + withSpare}`;
  return { quantity: base + withSpare, formula };
}

/** Service style kit line amount; the same formula as the kit fan-out in
 * src/logistics/pack-list.manifest. */
export function kitLineQuantity(
  kit: {
    baseQuantity: number;
    guestsPerUnit?: number | null;
    sparePercent?: number | null;
  },
  guests: number,
): number {
  if (kit.guestsPerUnit == null) return kit.baseQuantity;
  const grown = Math.ceil(Math.max(0, guests) / kit.guestsPerUnit);
  return (
    kit.baseQuantity +
    Math.ceil((grown * (100 + (kit.sparePercent ?? 0))) / 100)
  );
}

export function packLineKey(line: {
  description: string;
  unit: string;
  ownership: PackOwnership;
  returnRequired: boolean;
}): string {
  const name = line.description.trim().toLowerCase().replace(/\s+/g, " ");
  return `${name}|${line.unit}|${line.ownership}|${line.returnRequired ? "return" : "keep"}`;
}

function factLabel(key: string): string {
  return PACK_EVENT_FACTS.find((fact) => fact.key === key)?.label ?? key;
}

function ruleSources(
  rule: PackRuleInput,
  event: PackEventInput,
  dishes: PackDishInput[],
): PackSource[] {
  const make = (
    sourceType: PackSourceType,
    sourceId: string,
    sourceLabel: string,
    amount: { servings?: number; guests?: number },
  ): PackSource => {
    const { quantity, formula } = ruleQuantity(rule, amount);
    return {
      sourceType,
      sourceId,
      sourceLabel,
      ruleId: rule.id,
      ruleVersion: rule.ruleVersion,
      formula,
      quantity,
    };
  };
  const guests = event.headcount;
  switch (rule.trigger) {
    case "dish":
      return dishes
        .filter((dish) => dish.dishId === rule.dishId && dish.servings > 0)
        .map((dish) =>
          make("dish", dish.eventDishId, dish.dishName, {
            servings: dish.servings,
            guests,
          }),
        );
    case "production_note":
      return dishes
        .filter(
          (dish) =>
            dish.servings > 0 &&
            (rule.dishId == null || dish.dishId === rule.dishId) &&
            (rule.matchText ?? "").trim().length > 0 &&
            factMatches(dish.note, rule.matchText),
        )
        .map((dish) =>
          make(
            "production_note",
            dish.eventDishId,
            `${dish.dishName}: "${(dish.note ?? "").trim()}"`,
            { servings: dish.servings, guests },
          ),
        );
    case "service_style":
      return rule.serviceStyleId != null &&
        rule.serviceStyleId === event.serviceStyleId
        ? [
            make(
              "service_style",
              rule.serviceStyleId,
              event.serviceStyleName ?? "Service style",
              { guests },
            ),
          ]
        : [];
    case "guest_count":
      return guests > 0
        ? [make("guest_count", event.eventId, `${guests} guests`, { guests })]
        : [];
    case "event_fact": {
      const key = rule.matchFact ?? "";
      const value = event.facts[key];
      if (!factMatches(value, rule.matchText)) return [];
      const shown =
        typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : (value ?? "").trim();
      return [
        make(
          "event_fact",
          `${event.eventId}:${key}`,
          `${factLabel(key)}: ${shown}`,
          { guests },
        ),
      ];
    }
  }
}

function rentalLine(rental: PackRentalInput): Omit<PlannedPackLine, "key"> {
  const rented = rental.ownership === "rented";
  return {
    description: rental.name,
    unit: "each",
    category: rented ? "rental" : rental.category?.trim() || "other",
    ownership: rental.ownership,
    returnRequired: true,
    returnNote: rented
      ? "Goes back to the rental company"
      : "Comes back to the warehouse",
    requiredCapability: false,
    quantity: rental.quantity,
    sources: [
      {
        sourceType: "rental",
        sourceId: rental.reservationId,
        sourceLabel: `${rented ? "Rented" : "Our"} ${rental.name} held for this event`,
        ruleId: null,
        ruleVersion: null,
        formula: `${rental.quantity} held`,
        quantity: rental.quantity,
      },
    ],
  };
}

function sourceOrder(a: PackSource, b: PackSource): number {
  return `${a.sourceType}|${a.sourceId}|${a.ruleId ?? ""}`.localeCompare(
    `${b.sourceType}|${b.sourceId}|${b.ruleId ?? ""}`,
  );
}

/** Every pack line the event's facts ask for, merged and sorted. */
export function planPackLines(input: {
  event: PackEventInput;
  dishes: PackDishInput[];
  rules: PackRuleInput[];
  rentals: PackRentalInput[];
}): PlannedPackLine[] {
  const lines = new Map<string, PlannedPackLine>();
  const add = (line: Omit<PlannedPackLine, "key">) => {
    if (line.quantity <= 0) return;
    const key = packLineKey(line);
    const found = lines.get(key);
    if (!found) {
      lines.set(key, { ...line, key, sources: [...line.sources] });
      return;
    }
    found.quantity += line.quantity;
    found.sources.push(...line.sources);
    found.requiredCapability ||= line.requiredCapability;
    found.returnNote ??= line.returnNote;
  };
  for (const rule of input.rules) {
    for (const source of ruleSources(rule, input.event, input.dishes)) {
      add({
        description: rule.description.trim(),
        unit: rule.unit,
        category: rule.category,
        ownership: rule.ownership,
        returnRequired: rule.returnRequired,
        returnNote: rule.returnNote?.trim() || null,
        requiredCapability: rule.requiredCapability,
        quantity: source.quantity,
        sources: [source],
      });
    }
  }
  for (const rental of input.rentals) add(rentalLine(rental));
  return [...lines.values()]
    .map((line) => ({ ...line, sources: line.sources.sort(sourceOrder) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function serializePackSources(sources: PackSource[]): string {
  return JSON.stringify(sources);
}

export function parsePackSources(
  json: string | null | undefined,
): PackSource[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as PackSource[]) : [];
  } catch {
    return [];
  }
}
