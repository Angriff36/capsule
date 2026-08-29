import {
  useListDish,
  useListMenu,
  useListMenuDish,
} from "../../lib/manifest-convex-react";

export type MenuTemplateLine = {
  dishId: string;
  course?: string;
  serviceStyle?: string;
};

export type MenuTemplate = {
  menuId: string;
  name: string;
  lines: MenuTemplateLine[];
};

type Props = {
  existingDishIds: string[];
  busy: boolean;
  onApply: (template: MenuTemplate) => void;
};

/**
 * Published catalog menus offered as starting points. Applying copies each
 * line onto the event as a normal menu line the operator can then edit.
 */
export function EventMenuTemplateCard({
  existingDishIds,
  busy,
  onApply,
}: Props) {
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const dishes = useListDish();

  if (menus === undefined || menuDishes === undefined || dishes === undefined) {
    return null;
  }

  const templates = (menus ?? [])
    .filter(
      (menu) =>
        menu.deletedAt == null &&
        menu.isTemplate === true &&
        String(menu.status) === "published",
    )
    .map((menu) => {
      const lines = (menuDishes ?? [])
        .filter(
          (line) =>
            line.deletedAt == null &&
            line.menuId === menu._id &&
            String(
              (dishes ?? []).find((dish) => dish._id === line.dishId)?.status ??
                "",
            ) === "active",
        )
        .map((line) => ({
          dishId: line.dishId,
          course: line.course ?? undefined,
          serviceStyle: line.serviceStyle ?? undefined,
        }));
      return {
        menuId: menu._id,
        name: String(menu.name),
        lines,
      };
    })
    .filter((template) => template.lines.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink">Use template</p>
      {templates.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">
          No menu templates published yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {templates.map((template) => {
            const courses = new Set(
              template.lines
                .map((line) => (line.course ?? "").trim())
                .filter((course) => course.length > 0),
            );
            const alreadyOnMenu = template.lines.every((line) =>
              existingDishIds.includes(line.dishId),
            );
            return (
              <button
                key={template.menuId}
                type="button"
                className="rounded-sm border border-line px-2 py-1.5 text-left hover:bg-inset"
                disabled={busy || alreadyOnMenu}
                onClick={() => onApply(template)}
              >
                <span className="block text-sm font-medium text-ink">
                  {template.name}
                </span>
                <span className="block text-sm text-ink-3">
                  {courses.size > 0
                    ? `${courses.size} ${courses.size === 1 ? "course" : "courses"}`
                    : `${template.lines.length} ${template.lines.length === 1 ? "dish" : "dishes"}`}
                  {alreadyOnMenu ? " · already on menu" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
