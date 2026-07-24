import { useMemo, useState } from "react";
import type { Id } from "../../lib/api";
import {
  useCreateEventLayoutSection,
  useEventLayoutSectionRemove,
  useEventLayoutSectionUpdate,
  useListEventLayoutSection,
} from "../../lib/manifest-convex-react";
import { BATTLE_BOARD_LAYOUT_TYPES } from "./battleBoardLayoutTypes";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { EventFormCluster } from "./EventFormCluster";
import { EventTabPanel } from "./EventTabPanel";
import { FailureBanner } from "./FailureBanner";

type Props = {
  readonly eventId: Id<"events">;
};

/** Layout & setup sections with type dropdown + editable instructions. */
export function EventBattleBoardLayoutsPanel({ eventId }: Props) {
  const sections = useListEventLayoutSection();
  const addSection = useCreateEventLayoutSection();
  const updateSection = useEventLayoutSectionUpdate();
  const removeSection = useEventLayoutSectionRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

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
                      <option value={section.type}>{section.type}</option>
                    )}
                    {BATTLE_BOARD_LAYOUT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
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
