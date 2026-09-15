import type { SourceKind } from "./model";
export const PARSER_VERSION = "event-packet/1";
export function recognizeSource(input: {
  name?: string;
  mimeType?: string;
  text?: string;
  rows?: string[][];
}) {
  const t = (
    (input.text ?? "") +
    "\n" +
    (input.rows?.map((r) => r.join(" ")).join("\n") ?? "")
  ).replace(/\s+/g, " ");
  const signatures: [SourceKind, RegExp[]][] = [
    ["training", [/Ops Final Lock.{0,8}Training Resource/i]],
    ["kitchen_shift", [/Kitchen Shift/i, /Powered by Nowsta/i]],
    ["event_forms", [/Event Task Breakdown/i, /Leaving The Shop Checklist/i]],
    ["quartermaster", [/Quartermaster/i, /Pre.Production/i]],
    ["ops_final_lock", [/VERIFY SERVICE STYLE/i, /WRAP UP/i]],
    ["worksheet", [/Event Worksheet/i, /Invoice\s*#/i]],
    ["beo", [/Banquet Event Order/i]],
    ["event_menu", [/Event\s+Menu/i, /Prepared for/i]],
    ["menu_production", [/Production Notes/i, /Quantity\/?Unit/i]],
    ["event_tracker", [/EVENT\s*#/i, /WAREHOUSE/i, /SERVICE STYLE/i]],
    ["packlist_csv", [/Pack List/i, /Grouped by: Classification/i]],
    ["packlist_item_type", [/Pack List/i, /Grouped by: Item Type/i]],
    ["packlist_category", [/Pack List/i, /Grouped by: Category/i]],
    [
      "nowsta_event_timesheet",
      [/Powered by Nowsta/i, /Employee/i, /Start/i, /End/i],
    ],
  ];
  const hit = signatures.find(([, rules]) => rules.every((r) => r.test(t)));
  return {
    kind: hit?.[0] ?? ("unknown" as SourceKind),
    parserVersion: PARSER_VERSION,
    recognitionEvidence: hit
      ? hit[1].map((r) => t.match(r)![0])
      : ["No supported content signature"],
  };
}
