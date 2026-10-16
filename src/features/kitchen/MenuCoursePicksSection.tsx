import { useState, type FormEvent } from "react";
import { useMenuSetCoursePicks } from "../../lib/manifest-convex-react";
import {
  coursePickFor,
  coursePickText,
  readCoursePicks,
  type CoursePick,
} from "../../lib/coursePicks";
import { usePricingRules } from "../../lib/usePricingRules";

/**
 * How many dishes the client picks from each course when booking: "Salads,
 * pick 1", "Sides, pick 2–3", "Pizza flavors, up to 3". Empty = no rule for
 * that course. Shown when the company turned on the extra menu fields, or
 * when this menu already has rules.
 */
export function MenuCoursePicksSection({
  menu,
  courses,
  onFailure,
}: Readonly<{
  menu: {
    _id: string;
    version: number;
    status: string;
    coursePicksJson?: string | null;
  };
  courses: string[];
  onFailure: (error: unknown) => void;
}>) {
  const rules = usePricingRules();
  const setPicks = useMenuSetCoursePicks();
  const saved = readCoursePicks(menu);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!rules) return null;
  if (!rules.menuPriceOptions && saved.length === 0) return null;
  const canEdit = menu.status === "draft" || menu.status === "published";
  // A saved rule whose course has no dishes left stays listed to clear it.
  const allCourses = [
    ...courses,
    ...saved
      .map((rule) => rule.course)
      .filter(
        (course) =>
          !courses.some((c) => c.toLowerCase() === course.toLowerCase()),
      ),
  ];

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: CoursePick[] = [];
    for (const [index, course] of allCourses.entries()) {
      const minRaw = String(data.get(`min${index}`) ?? "").trim();
      const maxRaw = String(data.get(`max${index}`) ?? "").trim();
      if (!minRaw && !maxRaw) continue;
      const min = Math.round(Number(minRaw || 0));
      const max = Math.round(Number(maxRaw || minRaw));
      if (!(min >= 0) || !(max >= 1) || max < min) {
        setError(
          `${course}: the most has to be 1 or more and not less than the least.`,
        );
        return;
      }
      next.push({ course, min, max });
    }
    setError(null);
    setSaving(true);
    onFailure(null);
    setPicks({
      docId: menu._id,
      version: menu.version,
      picksJson: next.length > 0 ? JSON.stringify(next) : undefined,
    })
      .catch(onFailure)
      .finally(() => setSaving(false));
  };

  return (
    <section className="culinary-section" aria-labelledby="menu-course-picks">
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">This menu</p>
          <h2 id="menu-course-picks">Client picks</h2>
        </div>
        <span>How many dishes the client picks from each course</span>
      </div>
      {allCourses.length === 0 ? (
        <p className="mt-3 text-base text-ink-2">
          Give this menu&apos;s dishes a course first.
        </p>
      ) : (
        <form
          key={`${menu._id}:${menu.version}`}
          className="mt-4 grid gap-3"
          onSubmit={save}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Least</th>
                <th scope="col">Most</th>
                <th scope="col">Shows as</th>
              </tr>
            </thead>
            <tbody>
              {allCourses.map((course, index) => {
                const rule = coursePickFor(saved, course);
                return (
                  <tr key={course}>
                    <th scope="row">{course}</th>
                    <td>
                      <input
                        className="input w-20"
                        name={`min${index}`}
                        type="number"
                        min={0}
                        step={1}
                        disabled={!canEdit || saving}
                        aria-label={`${course}: least dishes picked`}
                        defaultValue={rule ? rule.min : ""}
                      />
                    </td>
                    <td>
                      <input
                        className="input w-20"
                        name={`max${index}`}
                        type="number"
                        min={1}
                        step={1}
                        disabled={!canEdit || saving}
                        aria-label={`${course}: most dishes picked`}
                        defaultValue={rule ? rule.max : ""}
                      />
                    </td>
                    <td className="text-ink-2">
                      {rule ? coursePickText(rule) : "No rule"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-ink-3">
            Leave both empty for no rule. Least 0 shows as &quot;Up to&quot;.
          </p>
          {error ? (
            <p role="alert" className="text-base text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canEdit || saving}
            >
              {saving ? "Saving…" : "Save client picks"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
