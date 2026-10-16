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
  },
  {
    id: "SegmentedTabs",
    label: "Filter tabs",
    kind: "tabs",
    story: "UI Layouts/UiLayouts",
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
  },
  {
    id: "EventStageRail",
    label: "Event stage rail",
    kind: "rail",
    story: "Events/EventStageRail",
  },
  {
    id: "PrepTaskRow",
    label: "Prep task row",
    kind: "row",
    story: "Kitchen/PrepTaskRow",
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
  const matching = STUDIO_CATALOG.filter((entry) => entry.kind === kind);
  const related =
    kind === "masthead"
      ? STUDIO_CATALOG.filter(
          (entry) =>
            entry.kind === "empty" ||
            entry.kind === "error" ||
            entry.kind === "section",
        )
      : [];
  const combined = [
    ...matching,
    ...related.filter(
      (entry) => !matching.some((item) => item.id === entry.id),
    ),
  ];
  return combined.length > 0 ? combined : [...STUDIO_CATALOG];
}
