import { useMemo, useState } from "react";
import type { Id } from "../../lib/api";
import {
  useCreateEventLayoutSection,
  useEventLayoutSectionRemove,
  useEventLayoutSectionUpdate,
  useGetEvent,
  useGetVenue,
  useListEventLayoutSection,
  useListVenueLayoutTemplate,
} from "../../lib/manifest-convex-react";
import { PlusIcon } from "../../ui/icons";
import { venueLayoutTemplatesListPath } from "../facilities/facilitiesRoutes";
import { BATTLE_BOARD_LAYOUT_TYPES } from "./battleBoardLayoutTypes";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { EventLayoutSectionCard } from "./EventLayoutSectionCard";
import { EventLayoutsSidebar, type VenueNote } from "./EventLayoutsSidebar";
import { FailureBanner } from "./FailureBanner";
import {
  layoutAccessibilityText,
  layoutCategoryCounts,
  layoutHasInstructions,
  trimLayoutField,
} from "./layoutTrim";
import { useApplyLayoutTemplate } from "../../lib/safeMaterialization";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";

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
  const applyLayoutTemplate = useApplyLayoutTemplate();
  const updateSection = useEventLayoutSectionUpdate();
  const removeSection = useEventLayoutSectionRemove();
  const event = useGetEvent(eventId);
  const venue = useGetVenue(event?.venueId ?? "skip");
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
    const venueId = event?.venueId ?? null;
    return (templates ?? [])
      .filter(
        (t) =>
          t.deletedAt == null &&
          t.status === "active" &&
          (venueId == null || t.venueId === venueId),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, event]);

  const categories = useMemo(
    () => layoutCategoryCounts(eventSections),
    [eventSections],
  );

  const venueNotes: VenueNote[] = useMemo(() => {
    const candidates: readonly (readonly [string, string, unknown])[] = [
      ["access", "Access", venue?.accessNotes],
      ["loadIn", "Load-in", venue?.loadInInstructions],
      ["logistics", "Logistics", venue?.logisticsNotes],
      ["kitchen", "Kitchen", venue?.kitchenAccess],
      ["waste", "Waste", venue?.wasteRules],
    ];
    return candidates
      .filter(
        (entry): entry is readonly [string, string, string] =>
          typeof entry[2] === "string" && entry[2].trim().length > 0,
      )
      .map(([key, label, text]) => ({ key, label, text }));
  }, [venue]);

  const describedSections = eventSections.filter((section) =>
    layoutHasInstructions(section.instructions),
  ).length;

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

  const addBlankSection = () =>
    void run("add", () =>
      addSection({
        eventId,
        type: "Buffet",
        instructions: "",
        sortOrder: eventSections.length,
      }),
    );

  const copyFromTemplate = () => {
    const template = copyable.find((t) => t._id === copyTemplateId);
    if (!template) return;
    const templateSections = parseSections(template.sections);
    if (templateSections.length === 0) {
      setFailure(
        classifyCommandFailure(
          new Error("That template has no sections to copy."),
        ),
      );
      return;
    }
    // Validate every section BEFORE any mutation so a bad template (e.g. a
    // blank type from a hand-edit) fails fast instead of leaving a partial copy.
    const invalidIndex = templateSections.findIndex(
      (s) => !trimLayoutField(s.type),
    );
    if (invalidIndex >= 0) {
      setFailure(
        classifyCommandFailure(
          new Error(
            `Section ${invalidIndex + 1} has a blank type. Fix the template before copying.`,
          ),
        ),
      );
      return;
    }
    const base = eventSections.length;
    void run("copy", async () => {
      const scope = `layout-template:${eventId}:${template._id}`;
      const pending = beginPendingOperation(scope, {
        eventId,
        baseSortOrder: base,
        sections: templateSections.map((section) => ({
          type: section.type,
          instructions: section.instructions ?? "",
        })),
      });
      await applyLayoutTemplate({
        ...pending.payload,
        operationKey: pending.key,
      });
      confirmPendingOperation(scope);
      setCopyTemplateId("");
    });
  };

  return (
    <div
      className="flex flex-col gap-5 xl:flex-row"
      data-testid="event-battle-board-layouts"
    >
      <div className="min-w-0 flex-1 space-y-5">
        <section className="card p-5" aria-label="Layout & setup">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">
                Venue layout &amp; setup
              </h3>
              <p className="mt-1 text-sm text-ink-2">
                {venue?.name ?? "No venue linked to this event yet"}
              </p>
              <p className="mt-1 text-sm text-ink-3">
                Name each area — pick a preset (Buffet, Bar, Kitchen…) or type
                your own, like “Main Bar” and “Patio Bar” — then write setup
                notes for this event.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy != null}
              onClick={addBlankSection}
            >
              + Add Section
            </button>
          </div>

          {copyable.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
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
                className="btn btn-ghost"
                disabled={busy != null || copyTemplateId === ""}
                onClick={copyFromTemplate}
              >
                Copy sections
              </button>
            </div>
          ) : null}
        </section>

        {failure ? <FailureBanner failure={failure} /> : null}

        {/* Preset suggestions for every area-name input below. The stored value
            is a free string, so “Main Bar” and “Patio Bar” are both valid. */}
        <datalist id="battle-board-layout-type-presets">
          {BATTLE_BOARD_LAYOUT_TYPES.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>

        {eventSections.length === 0 ? (
          <div className="card empty-state">
            <strong className="text-base text-ink">No layout sections</strong>
            <span>Add Buffet, Bar, Parking, or another area.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {eventSections.map((section) => (
              <EventLayoutSectionCard
                key={section._id}
                section={{
                  id: String(section._id),
                  type: typeof section.type === "string" ? section.type : "",
                  instructions:
                    typeof section.instructions === "string"
                      ? section.instructions
                      : "",
                  version: section.version,
                }}
                disabled={busy != null}
                onRename={(next) =>
                  void run(`type:${section._id}`, () =>
                    updateSection({
                      docId: section._id,
                      version: section.version,
                      type: next,
                    }),
                  )
                }
                onInstructions={(next) =>
                  void run(`notes:${section._id}`, () =>
                    updateSection({
                      docId: section._id,
                      version: section.version,
                      instructions: next,
                    }),
                  )
                }
                onRemove={() =>
                  void run(`rm:${section._id}`, () =>
                    removeSection({
                      docId: section._id,
                      version: section.version,
                    }),
                  )
                }
              />
            ))}
          </div>
        )}

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-line-2 px-5 py-3 font-semibold text-brand hover:border-brand hover:bg-inset"
          disabled={busy != null}
          onClick={addBlankSection}
        >
          <PlusIcon />
          Add layout section
        </button>
      </div>

      <EventLayoutsSidebar
        totalSections={eventSections.length}
        describedSections={describedSections}
        categories={categories}
        venueCapacity={
          venue?.capacity != null && venue.capacity > 0 ? venue.capacity : null
        }
        expectedHeadcount={event?.expectedHeadcount ?? null}
        venueNotes={venueNotes}
        accessibilityNeeds={layoutAccessibilityText(event?.accessibilityNeeds)}
        templatesPath={venueLayoutTemplatesListPath(
          event?.venueId ?? undefined,
        )}
      />
    </div>
  );
}
