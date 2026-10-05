/**
 * One pack line set, four working views (spec §13.2, AC-381/AC-540):
 * - reference: grouped by what each line supports (dish, style, guests,
 *   venue and bar, rentals, added by hand) - the binder copy;
 * - warehouse: grouped by kind in walking order for the packer;
 * - load: grouped by truck or trailer on the event;
 * - returns: only what must come back, by who takes it.
 * Views are projections of the SAME rows: they never copy a quantity, so a
 * count saved from any view shows in all of them.
 */
import { parsePackSources } from "../../lib/packRules";
import { PACK_CATEGORIES } from "./packRuleDraft";
import { packCategoryLabel, type PackLineFacts } from "./packLineExplanation";

export type PackViewKind =
  "all" | "reference" | "warehouse" | "load" | "returns";

export const PACK_VIEWS: ReadonlyArray<{ kind: PackViewKind; label: string }> =
  [
    { kind: "all", label: "Whole list" },
    { kind: "reference", label: "By dish and purpose" },
    { kind: "warehouse", label: "Warehouse walk" },
    { kind: "load", label: "Truck load" },
    { kind: "returns", label: "Coming back" },
  ];

export type PackViewLine = PackLineFacts & {
  _id: string;
  description: string;
  dishId?: string | null;
  eventDishId?: string | null;
  loadAssignmentId?: string | null;
};

export type PackRig = { id: string; label: string };

export type PackViewGroup<T extends PackViewLine> = {
  key: string;
  label: string;
  lines: T[];
};

type Context = {
  dishName: (dishId: string) => string | null;
  rigs: PackRig[];
};

function group<T extends PackViewLine>(
  lines: T[],
  pick: (line: T) => { key: string; label: string; order: number } | null,
): PackViewGroup<T>[] {
  const groups = new Map<string, PackViewGroup<T> & { order: number }>();
  for (const line of lines) {
    const at = pick(line);
    if (!at) continue;
    const found = groups.get(at.key);
    if (found) found.lines.push(line);
    else
      groups.set(at.key, {
        key: at.key,
        label: at.label,
        order: at.order,
        lines: [line],
      });
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(({ key, label, lines: rows }) => ({ key, label, lines: rows }));
}

function referenceGroup(line: PackViewLine, ctx: Context) {
  if (line.dishId) {
    const name = ctx.dishName(line.dishId) ?? "A dish";
    // Keyed by menu line so a dish's container and its rule lines meet.
    const key = line.eventDishId
      ? `dish-line:${line.eventDishId}`
      : `dish:${line.dishId}`;
    return { key, label: name, order: 0 };
  }
  const sources = parsePackSources(line.sourcesJson);
  const dishSources = sources.filter(
    (s) => s.sourceType === "dish" || s.sourceType === "production_note",
  );
  if (sources.length > 0 && dishSources.length === sources.length) {
    const ids = new Set(dishSources.map((s) => s.sourceId));
    if (ids.size > 1)
      return { key: "dishes", label: "Shared by several dishes", order: 1 };
    const label = dishSources[0]!.sourceLabel.split(': "')[0]!;
    return { key: `dish-line:${dishSources[0]!.sourceId}`, label, order: 0 };
  }
  const types = new Set(sources.map((s) => s.sourceType));
  if (line.serviceStyleKitItemId || types.has("service_style"))
    return { key: "style", label: "Service style", order: 2 };
  if (types.has("guest_count"))
    return { key: "guests", label: "For the guests", order: 3 };
  if (types.has("event_fact"))
    return { key: "venue", label: "Venue, setup and bar", order: 4 };
  if (types.has("rental"))
    return { key: "rentals", label: "Rentals and held equipment", order: 5 };
  if (line.packListTemplateId)
    return { key: "template", label: "From templates", order: 6 };
  return { key: "hand", label: "Added by hand", order: 7 };
}

function warehouseGroup(line: PackViewLine) {
  if (line.category) {
    const index = PACK_CATEGORIES.indexOf(
      line.category as (typeof PACK_CATEGORIES)[number],
    );
    return {
      key: `cat:${line.category}`,
      label: packCategoryLabel(line.category),
      order: index < 0 ? 90 : index,
    };
  }
  if (line.dishContainerId)
    return { key: "containers", label: "Dish containers", order: 0.5 };
  if (line.serviceStyleKitItemId)
    return { key: "kit", label: "Style kit", order: 95 };
  return { key: "other", label: "Other", order: 99 };
}

function loadGroup(line: PackViewLine, ctx: Context) {
  if (line.excludedAt != null) return null;
  const rig =
    ctx.rigs.find((r) => r.id === line.loadAssignmentId) ??
    (line.loadAssignmentId == null && ctx.rigs.length === 1
      ? ctx.rigs[0]
      : undefined);
  if (rig)
    return {
      key: `rig:${rig.id}`,
      label: rig.label,
      order: ctx.rigs.indexOf(rig),
    };
  return { key: "none", label: "Not on a truck yet", order: 999 };
}

/** Lines that come back: marked so, or not marked and not throwaway. */
export function comesBack(
  line:
    | PackViewLine
    | {
        excludedAt?: number | null;
        returnRequired?: boolean | null;
        category?: string | null;
      },
): boolean {
  if (line.excludedAt != null) return false;
  if (line.returnRequired != null) return line.returnRequired;
  return line.category !== "disposable";
}

function returnGroup(line: PackViewLine) {
  if (!comesBack(line)) return null;
  if (line.ownership === "rented")
    return { key: "rented", label: "Back to the rental company", order: 0 };
  if (line.ownership === "client")
    return {
      key: "client",
      label: "The client's - leave or hand back",
      order: 1,
    };
  return { key: "ours", label: "Ours - back to the warehouse", order: 2 };
}

export function packView<T extends PackViewLine>(
  kind: PackViewKind,
  lines: T[],
  ctx: Context,
): PackViewGroup<T>[] {
  switch (kind) {
    case "all":
      return lines.length ? [{ key: "all", label: "", lines }] : [];
    case "reference":
      return group(lines, (line) => referenceGroup(line, ctx));
    case "warehouse":
      return group(lines, warehouseGroup);
    case "load":
      return group(lines, (line) => loadGroup(line, ctx));
    case "returns":
      return group(lines, returnGroup);
  }
}
