import {
  layoutTemplateDelta,
  parseLayoutTemplateSections,
  type LayoutSection,
} from "../../lib/layoutTemplateSections";

type TemplateRow = {
  readonly _id: string;
  readonly name: string;
  readonly sections: string;
  readonly version: number;
  readonly status: string;
  readonly deletedAt?: number | null;
};

type EventRow = {
  readonly type: string;
  readonly instructions?: string | null;
  readonly sourceTemplateId?: string | null;
  readonly sourceTemplateVersion?: number | null;
};

const label = (section: LayoutSection) =>
  section.instructions
    ? `${section.type} - ${section.instructions}`
    : section.type;

/** What a template will add, shown before "Copy sections". */
export function LayoutTemplatePreview({
  template,
}: {
  readonly template: TemplateRow | undefined;
}) {
  if (!template) return null;
  const sections = parseLayoutTemplateSections(template.sections);
  return (
    <div
      className="w-full text-sm text-ink-2"
      data-testid="layout-template-preview"
    >
      {sections.length === 0 ? (
        <p>This template has no sections yet.</p>
      ) : (
        <>
          <p className="text-ink-3">
            Adds {sections.length} section{sections.length === 1 ? "" : "s"} to
            this event. You can change them here; the template stays as it is.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {sections.map((section, index) => (
              <li key={index}>{label(section)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Which venue templates this event's layout came from, and what changed in
 * a template after the copy (spec §8.2: the copy is the event's own). */
export function LayoutTemplateLinks({
  rows,
  templates,
}: {
  readonly rows: readonly EventRow[];
  readonly templates: readonly TemplateRow[];
}) {
  const sourceIds = [
    ...new Set(
      rows
        .map((row) => row.sourceTemplateId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (sourceIds.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="layout-template-links">
      {sourceIds.map((id) => {
        const copied = rows.filter((row) => row.sourceTemplateId === id);
        const copiedVersion = Math.max(
          ...copied.map((row) => Number(row.sourceTemplateVersion ?? 0)),
        );
        const template = templates.find((row) => row._id === id);
        if (!template || template.deletedAt != null) {
          return (
            <p key={id} className="text-sm text-ink-3">
              Copied from a template that is no longer kept.
            </p>
          );
        }
        // Only a template saved again after the copy counts; edits made on
        // this event alone are the event's business.
        const delta =
          Number(template.version) > copiedVersion
            ? layoutTemplateDelta(
                parseLayoutTemplateSections(template.sections),
                copied.map((row) => ({
                  type: row.type,
                  instructions: row.instructions ?? undefined,
                })),
              )
            : null;
        const changed =
          delta != null &&
          (delta.onlyInTemplate.length > 0 || delta.onlyOnEvent.length > 0);
        return (
          <div key={id} className="text-sm text-ink-2">
            <p>
              Copied from <strong>{template.name}</strong>
              {changed
                ? ". The template was changed after this copy; this event keeps its own sections."
                : "."}
            </p>
            {changed && delta.onlyInTemplate.length > 0 ? (
              <p className="text-ink-3">
                In the template now, not on this event:{" "}
                {delta.onlyInTemplate.map(label).join("; ")}
              </p>
            ) : null}
            {changed && delta.onlyOnEvent.length > 0 ? (
              <p className="text-ink-3">
                On this event, not in the template now:{" "}
                {delta.onlyOnEvent.map(label).join("; ")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
