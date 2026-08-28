import type { ReactNode } from "react";
import { AlertTriangleIcon } from "../../ui/icons";
import { CULINARY_ALLERGENS } from "../kitchen/CulinaryAllergenVocabulary";

export type MenuCourseTally = { label: string; count: number };

type Props = {
  courses: MenuCourseTally[];
  allergenCodes: string[];
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
 * carries that a guest may react to, and the purchasing work it feeds.
 * Every figure is derived from the event's own menu lines.
 */
export function EventMenuSidebar({ courses, allergenCodes, children }: Props) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
      {courses.length > 0 ? (
        <div className="card p-4">
          <p className="eyebrow">Courses</p>
          <div className="mt-3 grid gap-2">
            {courses.map((course) => (
              <div
                key={course.label}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-base text-ink-2">{course.label}</span>
                <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-inset px-2 font-mono text-xs font-semibold text-ink-2">
                  {course.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {allergenCodes.length > 0 ? (
        <div className="rounded-md border border-warn/40 bg-warn-soft p-4">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon
              width={15}
              height={15}
              className="mt-0.5 shrink-0 text-warn"
            />
            <div className="min-w-0">
              <p className="text-base font-semibold text-warn">
                Allergens on this menu
              </p>
              <p className="mt-1 text-sm text-ink-2">
                {allergenCodes.map(allergenLabel).join(", ")}
              </p>
              <p className="mt-1.5 text-sm text-ink-3">
                Declared on the dish records. Guest restrictions live on the
                Guests tab.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {children}
    </aside>
  );
}
