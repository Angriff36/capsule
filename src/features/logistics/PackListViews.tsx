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

/** What the server says about each line's truck (PL-DELIVERY, AC-535). */
export type PackTransport = {
  lines: Array<{
    lineId: string;
    legId: string | null;
    trip: number | null;
    loadingZone: string | null;
    loadStartAt: number | null;
    departAt: number | null;
    holdWarning: string | null;
  }>;
  rigLoads: Array<{
    id: string;
    loadKg: number;
    capacityKg: number;
    message: string | null;
    unweighed: string[];
  }>;
};

const clock = (at: number | null) =>
  at == null
    ? "not known yet"
    : new Date(at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });

function RigSummary({
  rigId,
  lines,
  transport,
}: {
  rigId: string;
  lines: Row[];
  transport: PackTransport;
}) {
  const facts = transport.lines.filter((line) => line.legId === rigId);
  const first = facts[0];
  const load = transport.rigLoads.find((rig) => rig.id === rigId);
  const ids = new Set(lines.map((line) => String(line._id)));
  const warnings = facts.filter(
    (fact) => fact.holdWarning && ids.has(fact.lineId),
  );
  return (
    <div className="text-base text-ink-2">
      {first && (
        <p>
          {first.trip != null && `Trip ${first.trip} · `}
          {first.loadingZone ? `Loads at ${first.loadingZone} · ` : ""}
          Loading {clock(first.loadStartAt)} · Leaves {clock(first.departAt)}
        </p>
      )}
      {load && (
        <p className={load.message ? "text-danger" : undefined}>
          {load.message ?? `Carries ${load.loadKg} of ${load.capacityKg} kg.`}
          {load.unweighed.length > 0 &&
            ` ${load.unweighed.length} without a weight.`}
        </p>
      )}
      {warnings.map((fact) => (
        <p key={fact.lineId} role="alert" className="text-danger">
          {lines.find((line) => String(line._id) === fact.lineId)?.description}:{" "}
          {fact.holdWarning}
        </p>
      ))}
    </div>
  );
}

/** The pack list in one of its working views. Every view shows the same
 * rows and runs the same line actions, so a count saved in one view is the
 * count in all of them. */
export function PackListViews({
  view,
  onViewChange,
  rigs,
  items,
  transport,
  ...table
}: Omit<PackListItemTableProps, "items"> & {
  view: PackViewKind;
  onViewChange: (view: PackViewKind) => void;
  rigs: PackRig[];
  items: Row[];
  transport?: PackTransport | null;
}) {
  const groups = packView(view, items, {
    dishName: (id) => table.dishName(id),
    rigs,
  });
  // Counts stay open after the list has gone out: a straggler is loaded late
  // and the return is counted the next day. Truck and weight are planning.
  const lineActions = (item: Row) => {
    const packed = Number(item.packedQuantity) > 0;
    const actions: Array<{ key: string; label: string }> = [];
    if (view === "load") {
      if (table.canEditLines) {
        if (rigs.length > 1) actions.push({ key: "truck", label: "Truck" });
        actions.push({ key: "weight", label: "Weight" });
      }
      if (packed && table.canCount)
        actions.push({ key: "onTruck", label: "On truck" });
    } else if (view === "returns") {
      if (packed && table.canCount)
        actions.push({ key: "countReturn", label: "Count return" });
    } else if (packed && table.canCount) {
      actions.push({ key: "secondCheck", label: "Second check" });
    }
    return actions;
  };
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
        <PackListItemTable
          {...table}
          items={items}
          extraActions={(item) => lineActions(item)}
        />
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
            {view === "load" && transport && group.key.startsWith("rig:") && (
              <RigSummary
                rigId={group.key.slice(4)}
                lines={group.lines}
                transport={transport}
              />
            )}
            <PackListItemTable
              {...table}
              items={group.lines}
              selectableCount={group.lines.filter(table.canSelectItem).length}
              extraActions={(item) => lineActions(item)}
            />
          </section>
        ))
      )}
    </>
  );
}
