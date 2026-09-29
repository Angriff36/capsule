import {
  PackListItemTable,
  type PackListItemRow,
  type PackListItemTableProps,
} from "./PackListItemTable";
import {
  PACK_VIEWS,
  packView,
  type PackRig,
  type PackViewKind,
} from "./packViews";

type Row = PackListItemRow & { loadAssignmentId?: string | null };

/** The pack list in one of its working views. Every view shows the same
 * rows and runs the same line actions, so a count saved in one view is the
 * count in all of them. */
export function PackListViews({
  view,
  onViewChange,
  rigs,
  items,
  ...table
}: Omit<PackListItemTableProps, "items"> & {
  view: PackViewKind;
  onViewChange: (view: PackViewKind) => void;
  rigs: PackRig[];
  items: Row[];
}) {
  const groups = packView(view, items, {
    dishName: (id) => table.dishName(id),
    rigs,
  });
  return (
    <>
      <nav className="fact-row mt-2" aria-label="Pack list views">
        {PACK_VIEWS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={
              option.kind === view
                ? "btn btn-primary btn-sm"
                : "btn btn-ghost btn-sm"
            }
            aria-pressed={option.kind === view}
            onClick={() => onViewChange(option.kind)}
          >
            {option.label}
          </button>
        ))}
      </nav>
      {view === "all" || table.loading || items.length === 0 ? (
        <PackListItemTable {...table} items={items} />
      ) : groups.length === 0 ? (
        <p className="mt-3 text-base text-ink-2">
          {view === "returns"
            ? "Nothing on this list has to come back."
            : "No lines in this view."}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="mt-4" data-view-group={group.key}>
            <h3 className="font-medium text-ink">
              {group.label} · {group.lines.length}
            </h3>
            <PackListItemTable
              {...table}
              items={group.lines}
              selectableCount={group.lines.filter(table.canSelectItem).length}
              extraActions={
                view === "load" && rigs.length > 1 && table.canEditLines
                  ? () => [{ key: "truck", label: "Truck" }]
                  : undefined
              }
            />
          </section>
        ))
      )}
    </>
  );
}
