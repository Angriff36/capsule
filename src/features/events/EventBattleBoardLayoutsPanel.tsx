import { useMemo, useState } from "react";
import type { Id } from "../../lib/api";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  useCreateEventLayoutSection,
  useEventLayoutSectionRemove,
  useEventLayoutSectionUpdate,
  useGetEvent,
  useListEventLayoutSection,
  useListVenueLayoutTemplate,
} from "../../lib/manifest-convex-react";
import { BATTLE_BOARD_LAYOUT_TYPES } from "./battleBoardLayoutTypes";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { EventFormCluster } from "./EventFormCluster";
import { EventTabPanel } from "./EventTabPanel";
import { FailureBanner } from "./FailureBanner";

// Mirrors a VenueLayoutTemplate's stored sections JSON (see §8.2): each entry
// is the editable shape of an EventLayoutSection, copied verbatim into the
// event's setup snapshot.
type LayoutSection = {
  type: string;
  instructions: string | null;
  sortOrder: number;
};

const parseSections = (raw: string | null | undefined): LayoutSection[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is LayoutSection =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as LayoutSection).type === "string",
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
};

type Props = {
  readonly eventId: Id<"events">;
};

/** Layout & setup sections with type dropdown + editable instructions. */
export function EventBattleBoardLayoutsPanel({ eventId }: Props) {
  const sections = useListEventLayoutSection();
  const addSection = useCreateEventLayoutSection();
  const updateSection = useEventLayoutSectionUpdate();
  const removeSection = useEventLayoutSectionRemove();
  const event = useGetEvent(eventId);
  const templates = useListVenueLayoutTemplate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [copyTemplateId, setCopyTemplateId] = useState<string>("");

  const eventSections = useMemo(
    () =>
      (sections ?? [])
        .filter(
          (row) =>
            row.eventId === eventId &&
            row.deletedAt == null &&
            row.addedAt != null,
        )
        .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
    [sections, eventId],
  );

  // Active templates for this event's venue (spec §8.2). When the event has no
  // venue yet, offer all active templates so setup can still be seeded.
  const copyable = useMemo(() => {
    const venue = event?.venueId ?? null;
    return (templates ?? [])
      .filter(
        (t) =>
          t.deletedAt == null &&
          t.status === "active" &&
          (venue == null || t.venueId === venue),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, event]);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const copyFromTemplate = () => {
    const template = copyable.find((t) => t._id === copyTemplateId);
    if (!template) return;
    const templateSections = parseSections(template.sections);
    if (templateSections.length === 0) {
      alert("That template has no sections to copy.");
      return;
    }
    // Validate every section BEFORE any mutation so a bad template (e.g. a
    // blank type from a hand-edit) fails fast instead of leaving a partial copy.
    const invalidIndex = templateSections.findIndex((s) => !s.type.trim());
    if (invalidIndex >= 0) {
      alert(
        `Section ${invalidIndex + 1} has a blank type. Fix the template before copying.`,
      );
      return;
    }
    const base = eventSections.length;
    // ponytail: each section is a separate mutation, so a mid-loop network
    // drop can leave a partial (but valid) copy — upgrade to a server-side
    // bulk-copy action if that ever bites operators in practice.
    void run("copy", async () => {
      for (let i = 0; i < templateSections.length; i++) {
        const section = templateSections[i];
        await addSection({
          eventId,
          type: section.type,
          instructions: section.instructions ?? "",
          sortOrder: base + i,
        });
      }
      setCopyTemplateId("");
    });
  };

  return (
    <EventTabPanel
      eyebrow="Layout & setup"
      title={`${eventSections.length} ${eventSections.length === 1 ? "section" : "sections"}`}
      description="Pick a section type (Buffet, Bar, Kitchen…), then write setup notes for this event."
      actions={
        <button
          type="button"
          className="btn btn-primary min-h-10"
          disabled={busy != null}
          onClick={() =>
            void run("add", () =>
              addSection({
                eventId,
                type: "Buffet",
                instructions: "",
                sortOrder: eventSections.length,
              }),
            )
          }
        >
          + Add Section
        </button>
      }
      testId="event-battle-board-layouts"
    >
      {failure ? <FailureBanner failure={failure} /> : null}

      {copyable.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="field-label min-w-[12rem] flex-1">
            <span>Copy from venue template</span>
            <select
              className="input"
              value={copyTemplateId}
              disabled={busy != null}
              onChange={(changeEvent) =>
                setCopyTemplateId(changeEvent.target.value)
              }
            >
              <option value="">Select a template…</option>
              {copyable.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost min-h-10"
            disabled={busy != null || copyTemplateId === ""}
            onClick={copyFromTemplate}
          >
            Copy sections
          </button>
        </div>
      ) : null}

      {eventSections.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          No layout sections yet. Add Buffet, Bar, Parking, or another area.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {eventSections.map((section) => (
            <EventFormCluster
              key={section._id}
              title={section.type || "Section"}
              hint="Setup instructions for this area"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="field-label min-w-0 flex-1">
                  <span>Type</span>
                  <select
                    className="input"
                    value={section.type}
                    disabled={busy != null}
                    onChange={(changeEvent) =>
                      void run(`type:${section._id}`, () =>
                        updateSection({
                          docId: section._id,
                          version: section.version,
                          type: changeEvent.target.value,
                        }),
                      )
                    }
                  >
                    {BATTLE_BOARD_LAYOUT_TYPES.includes(
                      section.type as (typeof BATTLE_BOARD_LAYOUT_TYPES)[number],
                    ) ? null : (
                      <option value={section.type}>
                        {formatStatusLabel(section.type)}
                      </option>
                    )}
                    {BATTLE_BOARD_LAYOUT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {formatStatusLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost min-h-10"
                  disabled={busy != null}
                  onClick={() =>
                    void run(`rm:${section._id}`, () =>
                      removeSection({
                        docId: section._id,
                        version: section.version,
                      }),
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <label className="field-label">
                <span>Instructions</span>
                <textarea
                  className="input min-h-[5rem] py-2"
                  defaultValue={section.instructions ?? ""}
                  key={`${section._id}:${section.version}:${section.instructions ?? ""}`}
                  disabled={busy != null}
                  placeholder="Setup instructions, equipment, positioning…"
                  onBlur={(blurEvent) => {
                    const next = blurEvent.target.value;
                    const prev = section.instructions ?? "";
                    if (next === prev) return;
                    void run(`notes:${section._id}`, () =>
                      updateSection({
                        docId: section._id,
                        version: section.version,
                        instructions: next,
                      }),
                    );
                  }}
                />
              </label>
            </EventFormCluster>
          ))}
        </div>
      )}
    </EventTabPanel>
  );
}
