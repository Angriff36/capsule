/**
 * How many dishes a client picks from each course of a menu when booking
 * (Menu.coursePicksJson): "Pick 1 salad", "Sides, pick 2–3", "Up to 3 pizza
 * flavors". A course with no rule is offered as before. The rule guides and
 * warns; it never blocks a pick.
 */

export type CoursePick = { course: string; min: number; max: number };

export type PickState = "under" | "ok" | "over";

const whole = (value: unknown) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const sameCourse = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export function readCoursePicks(
  menu: { coursePicksJson?: string | null } | null | undefined,
): CoursePick[] {
  const json = menu?.coursePicksJson;
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      const min = whole(item.min);
      return {
        course: typeof item.course === "string" ? item.course.trim() : "",
        min,
        max: Math.max(min, whole(item.max)),
      };
    })
    .filter((rule) => rule.course && rule.max > 0);
}

export function coursePickFor(
  rules: readonly CoursePick[],
  course: string | null | undefined,
): CoursePick | null {
  return rules.find((rule) => sameCourse(course, rule.course)) ?? null;
}

/** "Pick 1", "Pick 1 or 2", "Pick 2–3", "Up to 3". */
export function coursePickText(rule: CoursePick): string {
  if (rule.min === rule.max) return `Pick ${rule.max}`;
  if (rule.min === 0) return `Up to ${rule.max}`;
  if (rule.max === rule.min + 1) return `Pick ${rule.min} or ${rule.max}`;
  return `Pick ${rule.min}–${rule.max}`;
}

export function pickState(rule: CoursePick, picked: number): PickState {
  if (picked < rule.min) return "under";
  if (picked > rule.max) return "over";
  return "ok";
}

/** How many of the picked dishes sit in the rule's course. */
export function countInCourse(
  rule: CoursePick,
  pickedCourses: readonly (string | null | undefined)[],
): number {
  return pickedCourses.filter((course) => sameCourse(course, rule.course))
    .length;
}
