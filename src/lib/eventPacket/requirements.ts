import forms from "./fixtures/event-workbook.form-definitions.json";
import type { EventPacketSnapshot, Section } from "./model";
export interface Requirement {
  key: string;
  fieldKey: string;
  section: Section;
  printSection: string;
  owner: string;
  message: string;
  allowNotApplicable: boolean;
}
export function sectionFor(key: string): Section {
  if (/staff|crew|nowsta|signature|takeoff|wrapup|signoff/.test(key))
    return "staffing";
  if (/vehicle|trailer/.test(key)) return "vehicles";
  if (/timeline|logistics|load-travel/.test(key)) return "timeline";
  if (/menu|production|guestCount/.test(key)) return "menu";
  if (/pack|binder|report/.test(key)) return "packlist";
  if (/layout|buffet|diagram|field.task/.test(key)) return "layouts";
  if (/contact|client/.test(key)) return "contacts";
  if (/equipment|rentals|beverage|bar/.test(key)) return "equipment";
  return "venue";
}
export const requiredFacts = [
  "invoiceNumber",
  "eventDate",
  "eventTitle",
  "guestCount",
  "serviceStyle",
  "venue.name",
  "venue.address",
  "contact.name",
  "contact.phone",
  "timeline.event_start.1.time",
  "timeline.event_end.1.time",
  "menu.required.name",
  "menu.required.quantity",
].map((fieldKey) => ({ fieldKey, section: sectionFor(fieldKey) }));
export function matchesRequired(
  fieldKey: string,
  requiredKey: string,
): boolean {
  if (requiredKey.startsWith("menu.required."))
    return (
      fieldKey.startsWith("menu.") &&
      fieldKey.endsWith("." + requiredKey.split(".").at(-1))
    );
  return fieldKey === requiredKey;
}
const custom: [string, string, string, boolean][] = [
  [
    "field.task-review",
    "serviceStyle",
    "Review the event task plan and record service-specific setup and service responsibilities",
    false,
  ],
  [
    "timeline.load-travel",
    "timeline",
    "Confirm staff-on, loading, both NLT/arrival visits and known travel windows",
    false,
  ],
  [
    "menu.components",
    "menu",
    "Reconcile meal servings with tray, salad and roll component counts",
    false,
  ],
  [
    "menu.unit-conversion",
    "menu",
    "Verify dessert and packing quantities in original units; record any approved conversion",
    false,
  ],
  [
    "production.placeholders",
    "production",
    "Review production instructions for *** or other recipe placeholders",
    false,
  ],
  [
    "assignment.vehicle",
    "vehicle",
    "Verify vehicle assignment and record the vehicle in the decision reason",
    true,
  ],
  [
    "assignment.trailer",
    "trailer",
    "Verify trailer assignment or explicitly record why none is required",
    true,
  ],
  [
    "assignment.crew",
    "crew",
    "Verify event crew and roles; a kitchen roster does not establish field staffing",
    false,
  ],
  [
    "report.nowsta_event_timesheet",
    "crew",
    "Verify the specific event Nowsta timesheet is available and current",
    false,
  ],
  [
    "report.packlist_item_type",
    "packlist",
    "Verify the TPP item-type packing report; CSV-derived reference is insufficient",
    false,
  ],
  [
    "report.packlist_category",
    "packlist",
    "Verify the TPP category packing report; CSV-derived reference is insufficient",
    false,
  ],
  [
    "live.tpp-final",
    "sourceStatus",
    "Verify current TPP Final Approval Date",
    false,
  ],
  [
    "live.tracker",
    "serviceStyle",
    "Verify current Event Tracker assignments, binder and packing state",
    false,
  ],
  [
    "live.goodshuffle",
    "equipment",
    "Verify current Good Shuffle rentals/decor and record scoped applicability",
    true,
  ],
  [
    "live.dropbox",
    "layouts",
    "Verify current Dropbox venue/rental assets and record scoped applicability",
    true,
  ],
  [
    "signature.warehouse-ops",
    "signature",
    "Warehouse/Ops final signature: actor and timestamp must identify the signer",
    false,
  ],
  [
    "signature.event-lead",
    "signature",
    "Event Lead final signature: actor and timestamp must identify the signer",
    false,
  ],
];
// Required checks are genuine PRE-PRINT decisions only: the Ops Final Lock
// content review (not its post-lock wrap-up steps) and the service-plan
// applicability decision. Quartermaster Thursday/Friday process steps and the
// field-execution forms (Leaving the Shop, Before Takeoff, ...) stay printed
// on their forms but never block workbook readiness.
const predeparture = (key: string) =>
  (key.startsWith("final-lock.") && !key.startsWith("final-lock.wrapup")) ||
  key === "field.buffet-drawing";
export const requirements: Requirement[] = [
  ...forms.sections
    .filter((s) => predeparture(s.key))
    .flatMap((s) =>
      s.items
        .filter(
          (i) =>
            // Names/dates are captured by the two signature decisions; drawings and field-use tables stay blank.
            !/field\.takeoff-readiness\.(warehouse-operations|event-lead)-(team-name|date)$/.test(
              i.key,
            ) &&
            (s.key !== "field.buffet-drawing" ||
              i.key.endsWith("buffet-applicability")),
        )
        .map((i) => ({
          key: "check." + i.key,
          fieldKey: i.key,
          section: sectionFor(i.key),
          printSection: s.title,
          owner: i.humanOwner,
          message: i.label,
          allowNotApplicable:
            !/(signature|team-name|operations-date|event-lead-date|initials)/.test(
              i.key,
            ),
        })),
    ),
  ...custom.map(([key, fieldKey, message, allowNotApplicable]) => ({
    key: "check." + key,
    fieldKey,
    section: sectionFor(key),
    printSection: key.split(".")[0],
    owner:
      key.startsWith("menu") || key.startsWith("production")
        ? "Culinary / Sales"
        : "Operations",
    message,
    allowNotApplicable,
  })),
];

/**
 * A vehicle check may be marked not applicable only while the event has no
 * active delivery record. Once a delivery exists, the check protects a real
 * dispatch decision and must be answered explicitly.
 */
export function canMarkNotApplicable(
  requirement: Requirement,
  snapshot: Pick<EventPacketSnapshot, "facts">,
): boolean {
  if (!requirement.allowNotApplicable) return false;
  if (requirement.key !== "check.assignment.vehicle") return true;
  return !snapshot.facts.some((fact) =>
    fact.fieldKey.startsWith("vehicle.native-"),
  );
}
export { forms as formDefinitions };
