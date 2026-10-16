import type { ReactNode } from "react";

export type StudioCatalogKind =
  | "masthead"
  | "empty"
  | "error"
  | "section"
  | "stat"
  | "chip"
  | "tabs"
  | "help"
  | "label"
  | "merged"
  | "rail"
  | "row";

export type StudioBlockModel = {
  title: string;
  lead?: string;
  value?: string;
};

export type StudioCatalogEntry = {
  id: string;
  label: string;
  kind: StudioCatalogKind;
  story: string;
  /**
   * Its live block has tabs, buttons, links or content the stand-in drops
   * (DESIGN.md: a swap keeps live data, routes and actions), so it is never
   * swapped in or out.
   */
  live?: true;
};

type StudioRenderer = (
  model: StudioBlockModel,
  original: ReactNode,
) => ReactNode;

const RENDERERS: Partial<Record<string, StudioRenderer>> = {};

/** Shipped Storybook catalog pieces that can sit in a live slot. */
export const STUDIO_CATALOG: readonly StudioCatalogEntry[] = [
  {
    id: "PageHeader",
    label: "Page heading",
    kind: "masthead",
    story: "Primitives/PageHeader",
  },
  {
    id: "EmptyState",
    label: "Empty state",
    kind: "empty",
    story: "Primitives/EmptyState",
  },
  {
    id: "ErrorState",
    label: "Error state",
    kind: "error",
    story: "Primitives/PageHeader",
  },
  {
    id: "Section",
    label: "Section card",
    kind: "section",
    story: "Primitives/PageHeader",
    live: true,
  },
  {
    id: "StatCard",
    label: "Stat tile",
    kind: "stat",
    story: "Charts/StatCard",
  },
  {
    id: "StatusChip",
    label: "Status chip",
    kind: "chip",
    story: "Primitives/StatusChip",
  },
  {
    id: "WorkspaceTabs",
    label: "Area tabs",
    kind: "tabs",
    story: "Navigation/WorkspaceTabs",
    live: true,
  },
  {
    id: "SegmentedTabs",
    label: "Filter tabs",
    kind: "tabs",
    story: "UI Layouts/UiLayouts",
    live: true,
  },
  {
    id: "FieldHelp",
    label: "Field help",
    kind: "help",
    story: "Primitives/FieldHelp",
  },
  {
    id: "BarcodeLabel",
    label: "Barcode label",
    kind: "label",
    story: "Primitives/BarcodeLabel",
  },
  {
    id: "MergedSection",
    label: "Folded section",
    kind: "merged",
    story: "Layout/MergedSection",
    live: true,
  },
  {
    id: "EventStageRail",
    label: "Event stage rail",
    kind: "rail",
    story: "Events/EventStageRail",
    live: true,
  },
  {
    id: "PrepTaskRow",
    label: "Prep task row",
    kind: "row",
    story: "Kitchen/PrepTaskRow",
    live: true,
  },
];

export function registerStudioRenderer(
  id: string,
  render: StudioRenderer,
): void {
  RENDERERS[id] = render;
}

export function studioCatalogEntry(id: string): StudioCatalogEntry | undefined {
  return STUDIO_CATALOG.find((entry) => entry.id === id);
}

export function renderStudioCatalog(
  id: string,
  model: StudioBlockModel,
  original: ReactNode,
): ReactNode {
  const render = RENDERERS[id];
  if (!render) return original;
  return render(model, original);
}

export function studioCatalogForKind(
  kind: StudioCatalogKind,
): StudioCatalogEntry[] {
  // Only pieces of the same kind: a page heading must stay the editorial
  // masthead with its <h1> (DESIGN.md "Page header"), so an empty or error
  // state is never offered in its place.
  return STUDIO_CATALOG.filter((entry) => entry.kind === kind);
}

/**
 * Pieces a slot may switch to: ones that fit the spot, when neither side has
 * anything live the stand-in would drop. `live` = this block shows buttons,
 * links or extra content right now.
 */
export function studioSwapChoices(
  kind: StudioCatalogKind,
  name: string,
  live: boolean,
): StudioCatalogEntry[] {
  if (live || studioCatalogEntry(name)?.live) return [];
  return studioCatalogForKind(kind).filter(
    (entry) => !entry.live && entry.id !== name,
  );
}

export function studioSwapAllowed(
  kind: StudioCatalogKind,
  name: string,
  live: boolean,
  target: string,
): boolean {
  return studioSwapChoices(kind, name, live).some(
    (entry) => entry.id === target,
  );
}
