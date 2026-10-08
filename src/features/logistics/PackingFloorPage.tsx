import { packListName } from "./packListName";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCountNoun, formatDate, formatTime } from "../../lib/format";
import { packingItemDescription } from "../../lib/packingDisplay";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  useListPerson,
  usePackListMarkLoaded,
  usePackListMarkPacked,
  usePackListResolveAssistance,
  usePackListStartPacking,
} from "../../lib/manifest-convex-react";
import { useActionNotice } from "../../ui/action-result";
import { EmptyState, PageHeader, TableSkeleton } from "../../ui/primitives";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import { useEventsById } from "../facilities/useEventsById";
import { usePackListsByStatus } from "../facilities/useLogisticsWindow";
import { eventDetailPath } from "../events/eventRoutes";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { packCategoryLabel } from "./packLineExplanation";
import "./DispatchBoard.css";

const OPEN_LINES_SHOWN = 6;
/** Pack lists the warehouse still has to pack or load. */
const FLOOR_STATUSES = ["draft", "packing", "packed"] as const;

const show = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

/**
 * Packing floor: every pack list the warehouse still has to pack or load,
 * soonest event first. Each row shows how far along it is, who has packed,
 * the next open lines, and a call for help when the packer is stuck. The
 * counting itself happens on the load sheet.
 */
export function PackingFloorPage() {
  const authStatus = useAuthStatus();
  // Only the open lists and their lines, read by status.
  const floor = usePackListsByStatus(FLOOR_STATUSES, true);
  const packLists = floor?.packLists;
  const eventIds = useMemo(
    () =>
      packLists === undefined
        ? undefined
        : packLists.map((list) => list.eventId),
    [packLists],
  );
  const events = useEventsById(eventIds);
  const packLines = floor?.packLines;
  const people = useListPerson();
  const startPacking = usePackListStartPacking();
  const markPacked = usePackListMarkPacked();
  const markLoaded = usePackListMarkLoaded();
  const resolveAssistance = usePackListResolveAssistance();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();

  const loading = [events, packLists, packLines].some(
    (value) => value === undefined,
  );

  const rows = useMemo(() => {
    if (loading) return [];
    return (packLists ?? [])
      .filter(
        (list) =>
          list.deletedAt == null &&
          ["draft", "packing", "packed"].includes(String(list.status)),
      )
      .map((list) => {
        const event = (events ?? []).find((row) => row._id === list.eventId);
        const lines = (packLines ?? []).filter(
          (line) =>
            line.deletedAt == null &&
            line.listedAt != null &&
            line.retiredAt == null &&
            line.excludedAt == null &&
            line.packListId === list._id,
        );
        let toPack = 0;
        let packed = 0;
        for (const line of lines) {
          const required = Number(line.requiredQuantity) || 0;
          toPack += required;
          packed += Math.min(Number(line.packedQuantity) || 0, required);
        }
        const open = lines.filter(
          (line) =>
            String(line.status) === "listed" &&
            Number(line.packedQuantity) < Number(line.requiredQuantity),
        );
        const missing = lines.filter(
          (line) => String(line.status) === "missing",
        );
        const packers = [
          ...new Set(
            lines
              .map((line) => line.packedByPersonId)
              .filter((id): id is string => id != null),
          ),
        ];
        return {
          list,
          event,
          lines,
          open,
          missing,
          packers,
          percent: toPack > 0 ? Math.round((packed / toPack) * 100) : null,
        };
      })
      .filter((row) => row.event != null && row.event.deletedAt == null)
      .sort(
        (a, b) =>
          Number(a.event?.startsAt ?? Infinity) -
          Number(b.event?.startsAt ?? Infinity),
      );
  }, [loading, events, packLists, packLines]);

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const canAct = [
    "logisticsAccess",
    "kitchenAccess",
    "eventAccess",
    "salesAccess",
    "manageAccess",
  ].some((capability) => permissions.has(capability));

  const personName = (id: string) => {
    const person = (people ?? []).find((row) => row._id === id);
    return (
      `${person?.givenName ?? ""} ${person?.familyName ?? ""}`.trim() ||
      "A teammate"
    );
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const stuck = rows.filter(
    (row) => row.list.assistanceRequestedAt != null,
  ).length;
  const packing = rows.filter(
    (row) => String(row.list.status) === "packing",
  ).length;

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        eyebrow="Logistics · Packing"
        title="Packing floor"
        lead="Every pack list still to pack or load, soonest event first."
        facts={[
          { label: "Lists", value: loading ? "…" : rows.length },
          { label: "Being packed", value: loading ? "…" : packing },
          { label: "Needs help", value: loading ? "…" : stuck },
        ]}
      />
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="The floor is clear."
          hint="A pack list shows here from the moment it is opened until it is loaded."
          action={
            <Link className="btn btn-ghost btn-sm" to="/logistics/packs">
              Open pack lists
            </Link>
          }
        />
      ) : (
        <ul className="dispatch-board" data-testid="packing-floor">
          {rows.map(
            ({ list, event, lines, open, missing, packers, percent }) => {
              const status = String(list.status);
              const needsHelp = list.assistanceRequestedAt != null;
              const label = packListName(list.name, event?.title);
              const args = { docId: list._id, version: list.version };
              return (
                <li
                  key={list._id}
                  className="dispatch-row"
                  data-tone={
                    needsHelp || missing.length > 0
                      ? "fix"
                      : status === "packed"
                        ? "ready"
                        : status === "packing"
                          ? "look"
                          : undefined
                  }
                >
                  <div className="dispatch-row-head">
                    <div className="min-w-0">
                      <p className="dispatch-row-when">
                        {event?.startsAt != null
                          ? `${formatDate(event.startsAt)} · ${formatTime(event.startsAt)}`
                          : "No date yet"}
                      </p>
                      <h2 className="dispatch-row-title">
                        <Link
                          to={`/logistics/packs/${list._id}?view=warehouse`}
                        >
                          {label}
                        </Link>
                      </h2>
                      <p className="text-base text-ink-2">
                        {event ? (
                          <Link
                            className="hover:underline"
                            to={eventDetailPath(event._id)}
                          >
                            {event.eventNumber ? `#${event.eventNumber} ` : ""}
                            {event.title}
                          </Link>
                        ) : null}
                      </p>
                    </div>
                    <span
                      className={`chip normal-case ${
                        needsHelp
                          ? "chip-tone-danger"
                          : status === "packed"
                            ? "chip-tone-ok"
                            : status === "packing"
                              ? "chip-tone-info"
                              : "chip-tone-mute"
                      }`}
                    >
                      {needsHelp
                        ? "Needs help"
                        : status === "packed"
                          ? "Packed, not loaded"
                          : status === "packing"
                            ? "Being packed"
                            : "Not started"}
                    </span>
                  </div>

                  {needsHelp ? (
                    <p className="text-base text-danger" role="alert">
                      The packer asked for help
                      {list.assistanceNote ? `: ${list.assistanceNote}` : "."}
                    </p>
                  ) : null}

                  <div className="fact-row">
                    <span className="fact">
                      <b>Packed:</b>
                      {percent == null ? "Nothing to pack" : `${percent}%`}
                    </span>
                    <span className="fact">
                      <b>Lines:</b>
                      {lines.length - open.length - missing.length} of{" "}
                      {lines.length} done
                    </span>
                    <span className="fact">
                      <b>Missing:</b>
                      {missing.length}
                    </span>
                    <span className="fact">
                      <b>Packed by:</b>
                      {packers.length > 0
                        ? packers.map(personName).join(", ")
                        : "Nobody yet"}
                    </span>
                  </div>

                  {percent != null ? (
                    <div
                      className="floor-bar"
                      role="progressbar"
                      aria-label={`${label} packed`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                    >
                      <i style={{ width: `${percent}%` }} />
                    </div>
                  ) : null}

                  {open.length > 0 ? (
                    <ul className="dispatch-open">
                      {open.slice(0, OPEN_LINES_SHOWN).map((line) => (
                        <li key={line._id}>
                          <span className="dispatch-open-mark">
                            {show(Number(line.packedQuantity))} of{" "}
                            {show(Number(line.requiredQuantity))}
                          </span>
                          <span>
                            {packingItemDescription(line.description)}
                            {line.category
                              ? ` · ${packCategoryLabel(line.category)}`
                              : ""}
                          </span>
                        </li>
                      ))}
                      {open.length > OPEN_LINES_SHOWN ? (
                        <li>
                          <span className="dispatch-open-mark" />
                          <span>
                            and{" "}
                            {formatCountNoun(
                              open.length - OPEN_LINES_SHOWN,
                              "more open line",
                            )}
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}

                  <div className="supply-row-actions">
                    <Link
                      className="btn btn-primary btn-sm"
                      to={`/logistics/packs/${list._id}?view=warehouse`}
                    >
                      Pack this list
                    </Link>
                    {canAct && needsHelp ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(`${list._id}:help`, async () => {
                            await resolveAssistance(args);
                            setNotice("Help request closed.");
                          })
                        }
                      >
                        {busy === `${list._id}:help`
                          ? "Working…"
                          : "Help given"}
                      </button>
                    ) : null}
                    {canAct && status === "draft" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(`${list._id}:start`, async () => {
                            await startPacking(args);
                            setNotice(`Packing started on ${label}.`);
                          })
                        }
                      >
                        {busy === `${list._id}:start`
                          ? "Working…"
                          : "Start packing"}
                      </button>
                    ) : null}
                    {canAct &&
                    status === "packing" &&
                    open.length === 0 &&
                    lines.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(`${list._id}:packed`, async () => {
                            await markPacked(args);
                            setNotice(`${label} marked packed.`);
                          })
                        }
                      >
                        {busy === `${list._id}:packed`
                          ? "Working…"
                          : "Mark packed"}
                      </button>
                    ) : null}
                    {canAct && status === "packed" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(`${list._id}:loaded`, async () => {
                            await markLoaded(args);
                            setNotice(`${label} marked loaded.`);
                          })
                        }
                      >
                        {busy === `${list._id}:loaded`
                          ? "Working…"
                          : "Mark loaded"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            },
          )}
        </ul>
      )}
    </div>
  );
}
