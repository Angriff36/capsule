/**
 * Capsule NEXT — the component layer the app is missing.
 *
 * Not a restyle of src/ui. These are components Capsule has no version of:
 * command palette, saved views, a real working table, inline edit, split
 * triage, a day timeline, a coverage grid, an audit trail, in-place decisions
 * and undo. They use app.css's @theme tokens, so they are already on-brand and
 * already correct in .dark.
 */
export { CommandBar, useCommandBar, type CommandItem } from "./CommandBar";
export { ViewBar, type SavedView, type AppliedFilter } from "./ViewBar";
export { LedgerTable, BulkBar, type LedgerColumn } from "./LedgerTable";
export { SplitInspector, type InspectorItem } from "./SplitInspector";
export { ActivityTrail, type TrailEntry } from "./ActivityTrail";
export {
  StageRail,
  StageBoard,
  ServiceTimeline,
  CoverageGrid,
  type Stage,
  type BoardCard,
  type TimelineBlock,
  type CoverageCell,
} from "./schedule";
export {
  Num,
  Money,
  Kbd,
  Presence,
  InlineEdit,
  DecisionPrompt,
  ToastStack,
  useToasts,
  TimeWindowField,
  type TimeValue,
  type Toast,
} from "./core";
