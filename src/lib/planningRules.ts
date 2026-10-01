/**
 * Planning rules: "when X is on the event, also bring Y". A rule only ever
 * suggests; nothing is added until a person accepts it.
 *
 * A rule is set off by every event, by one equipment item on the event, or
 * by any equipment of one kind on the event. Each thing it suggests has an
 * amount worked out as: a fixed amount + an amount per guest + an amount per
 * unit of what set the rule off, rounded up.
 *
 * The parts that "always go with" an equipment item are suggested the same
 * way, with no rule needed.
 *
 * Pure. The list a rule suggests is saved as JSON on PlanningRule.actionsJson.
 */

export type RuleActionKind = "equipment" | "position" | "task";

export const RULE_ACTION_KINDS: ReadonlyArray<{
  value: RuleActionKind;
  label: string;
}> = [
  { value: "equipment", label: "Equipment" },
  { value: "position", label: "Crew position" },
  { value: "task", label: "To-do" },
];

export type RuleAction = {
  kind: RuleActionKind;
  /** Equipment id, crew role, or to-do title. */
  target: string;
  base: number;
  perGuest: number;
  perTrigger: number;
};

const amount = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export function parseRuleActions(raw: string | null | undefined): RuleAction[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => {
      const entry = (row ?? {}) as Record<string, unknown>;
      const kind = String(entry.kind);
      return {
        kind: (kind === "equipment" || kind === "position" || kind === "task"
          ? kind
          : "task") as RuleActionKind,
        target: typeof entry.target === "string" ? entry.target.trim() : "",
        base: amount(entry.base),
        perGuest: amount(entry.perGuest),
        perTrigger: amount(entry.perTrigger),
      };
    })
    .filter((action) => action.target !== "");
}

export const ruleActionsJson = (actions: readonly RuleAction[]) =>
  JSON.stringify(actions);

/** "2 + 1 for every 40 guests + 1 for each one on the event". */
export function ruleAmountText(action: RuleAction): string {
  const parts: string[] = [];
  if (action.base > 0) parts.push(String(action.base));
  if (action.perGuest > 0) {
    const guests = 1 / action.perGuest;
    parts.push(
      Number.isInteger(Number(guests.toFixed(6)))
        ? `1 for every ${Math.round(guests)} guests`
        : `${action.perGuest} per guest`,
    );
  }
  if (action.perTrigger > 0)
    parts.push(
      action.perTrigger === 1
        ? "1 for each one on the event"
        : `${action.perTrigger} for each one on the event`,
    );
  return parts.length > 0 ? parts.join(" + ") : "none";
}

export type RuleRow = {
  _id: string;
  name: string;
  trigger: string;
  triggerEquipmentId?: string | null;
  triggerEquipmentKind?: string | null;
  actionsJson: string;
  status: string;
  deletedAt?: number | null;
};

export type RuleHold = {
  equipmentId: string;
  quantity: number;
};

export type RuleEquipment = {
  _id: string;
  name: string;
  category?: string | null;
};

export type RulePart = {
  equipmentId: string;
  partEquipmentId: string;
  role: string;
  quantity: number;
  removedAt?: number | null;
  deletedAt?: number | null;
};

export type RuleReceipt = {
  _id: string;
  version: number;
  suggestionKey: string;
  quantity: number;
  declined: boolean;
  basis?: string | null;
  deletedAt?: number | null;
};

export type PlanSuggestion = {
  /** Stable for one event: the rule and the line in it, or the part. */
  key: string;
  kind: RuleActionKind;
  target: string;
  /** What to show: the equipment name, the role or the to-do. */
  label: string;
  /** The amount the rule asks for in all. */
  wanted: number;
  /** How much of it is on the event now. */
  have: number;
  /** wanted - have: what accepting adds. */
  add: number;
  reason: string;
  /** What the amount was worked out from; a turned-down suggestion comes
   * back when this changes. */
  basis: string;
  receipt?: RuleReceipt;
};

export type SuggestionInput = {
  guests: number;
  rules: readonly RuleRow[];
  /** Live equipment holds on this event. */
  holds: readonly RuleHold[];
  equipment: readonly RuleEquipment[];
  parts: readonly RulePart[];
  /** Crew positions on the event by role: open, claimed and filled. */
  positionCount: (role: string) => number;
  /** To-dos on the event made from a suggestion, by its key. */
  hasTask: (suggestionKey: string) => boolean;
  receipts: readonly RuleReceipt[];
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** What the rules and the "goes with it" parts suggest for one event. */
export function suggestionsForEvent(input: SuggestionInput): PlanSuggestion[] {
  const heldOf = (equipmentId: string) =>
    input.holds
      .filter((hold) => hold.equipmentId === equipmentId)
      .reduce((sum, hold) => sum + hold.quantity, 0);
  const nameOf = (equipmentId: string) =>
    input.equipment.find((row) => row._id === equipmentId)?.name ??
    "Removed equipment";
  const receiptOf = (key: string) =>
    input.receipts.find(
      (row) => row.deletedAt == null && row.suggestionKey === key,
    );
  const out: PlanSuggestion[] = [];

  const push = (
    key: string,
    kind: RuleActionKind,
    target: string,
    label: string,
    wanted: number,
    have: number,
    reason: string,
    basisParts: unknown[],
  ) => {
    if (wanted <= have) return;
    const basis = JSON.stringify([wanted, ...basisParts]);
    const receipt = receiptOf(key);
    if (receipt?.declined && receipt.basis === basis) return;
    out.push({
      key,
      kind,
      target,
      label,
      wanted,
      have,
      add: wanted - have,
      reason,
      basis,
      receipt,
    });
  };

  for (const rule of input.rules) {
    if (rule.deletedAt != null || rule.status !== "active") continue;
    const units =
      rule.trigger === "every_event"
        ? 1
        : rule.trigger === "equipment"
          ? heldOf(rule.triggerEquipmentId ?? "")
          : input.holds
              .filter((hold) =>
                same(
                  input.equipment.find((row) => row._id === hold.equipmentId)
                    ?.category,
                  rule.triggerEquipmentKind,
                ),
              )
              .reduce((sum, hold) => sum + hold.quantity, 0);
    if (units <= 0) continue;
    const why =
      rule.trigger === "every_event"
        ? `${rule.name}: ${input.guests} guests`
        : `${rule.name}: ${units} on the event, ${input.guests} guests`;
    parseRuleActions(rule.actionsJson).forEach((action, index) => {
      const key = `rule:${rule._id}:${index}`;
      const wanted = Math.ceil(
        action.base +
          action.perGuest * input.guests +
          action.perTrigger * (rule.trigger === "every_event" ? 0 : units),
      );
      if (action.kind === "equipment")
        push(
          key,
          "equipment",
          action.target,
          nameOf(action.target),
          wanted,
          heldOf(action.target),
          why,
          [input.guests, units],
        );
      else if (action.kind === "position")
        push(
          key,
          "position",
          action.target,
          action.target,
          wanted,
          input.positionCount(action.target),
          why,
          [input.guests, units],
        );
      else
        push(
          key,
          "task",
          action.target,
          action.target,
          wanted > 0 ? 1 : 0,
          input.hasTask(key) ? 1 : 0,
          why,
          [input.guests, units],
        );
    });
  }

  // Parts that always go with a held item.
  const partNeeds = new Map<string, { needed: number; with: Set<string> }>();
  for (const part of input.parts) {
    if (
      part.deletedAt != null ||
      part.removedAt != null ||
      part.role !== "part"
    )
      continue;
    const held = heldOf(part.equipmentId);
    if (held <= 0) continue;
    const entry = partNeeds.get(part.partEquipmentId) ?? {
      needed: 0,
      with: new Set<string>(),
    };
    entry.needed += part.quantity * held;
    entry.with.add(nameOf(part.equipmentId));
    partNeeds.set(part.partEquipmentId, entry);
  }
  for (const [partId, entry] of partNeeds)
    push(
      `part:${partId}`,
      "equipment",
      partId,
      nameOf(partId),
      entry.needed,
      heldOf(partId),
      `Goes with ${[...entry.with].join(", ")}`,
      ["part"],
    );

  return out;
}
