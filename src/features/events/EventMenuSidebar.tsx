import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangleIcon } from "../../ui/icons";
import { CULINARY_ALLERGENS } from "../kitchen/CulinaryAllergenVocabulary";
import {
  EventMenuDietaryCard,
  type MenuDietaryTally,
} from "./EventMenuDietaryCard";
import {
  EventMenuNotesCard,
  type EventMenuNoteRow,
} from "./EventMenuNotesCard";
import {
  EventMenuTemplateCard,
  type MenuTemplate,
} from "./EventMenuTemplateCard";

export type MenuCourseTally = { label: string; count: number };

type Props = {
  eventId: string;
  courses: MenuCourseTally[];
  allergenCodes: string[];
  dietary: MenuDietaryTally[];
  notes: EventMenuNoteRow[];
  existingDishIds: string[];
  busy: boolean;
  onApplyTemplate: (template: MenuTemplate) => void;
  onEditNote: (row: EventMenuNoteRow) => void;
  children?: ReactNode;
};

/** Course counts as the menu lines actually record them. */
export function eventMenuCourseTallies(
  courses: (string | null | undefined)[],
): MenuCourseTally[] {
  const counts = new Map<string, number>();
  for (const raw of courses) {
    const label = String(raw ?? "").trim() || "Uncategorized";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function allergenLabel(code: string): string {
  return CULINARY_ALLERGENS.find((entry) => entry.code === code)?.label ?? code;
}

/**
 * Reading column beside the menu ledger: what the menu is made of, what it
 * carries that a guest may react to, the dietary ground it covers, the
 * templates it can start from, and the purchasing work it feeds.
 * Every figure is derived from the event's own menu lines.
 */
export function EventMenuSidebar({
  eventId,
  courses,
  allergenCodes,
  dietary,
  notes,
  existingDishIds,
  busy,
  onApplyTemplate,
  onEditNote,
  children,
}: Props) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
      {courses.length > 0 ? (
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink">Courses</p>
          <div className="mt-3 grid gap-2">
            {courses.map((course) => (
              <div
                key={course.label}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-sm text-ink-2">{course.label}</span>
                <span className="rounded-sm bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand">
                  {course.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <EventMenuDietaryCard tallies={dietary} eventId={eventId} />

      {allergenCodes.length > 0 ? (
        <div className="rounded-md border border-warn/40 bg-warn-soft p-4">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon
              width={15}
              height={15}
              className="mt-0.5 shrink-0 text-warn"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warn">
                Allergens on this menu
              </p>
              <p className="mt-1 text-sm text-warn">
                {allergenCodes.map(allergenLabel).join(", ")}
              </p>
              <Link
                to={`/events/${eventId}/allergen-briefing`}
                className="btn-link mt-1.5 inline-block"
              >
                View guest restrictions
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <EventMenuTemplateCard
        existingDishIds={existingDishIds}
        busy={busy}
        onApply={onApplyTemplate}
      />

      <EventMenuNotesCard notes={notes} busy={busy} onEditNote={onEditNote} />

      {children}
    </aside>
  );
}
