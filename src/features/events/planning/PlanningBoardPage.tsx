import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { formatCountNoun, formatTime } from "../../../lib/format";
import {
  useCreateEventAssignment,
  useCreateEventPlanNeeds,
  useCreateEventVehicleAssignment,
  useCreatePlanningReceipt,
  useEquipmentReservationCancel,
  useEventAssignmentChooseTravelLeg,
  useEventAssignmentUnassign,
  useEventPlanNeedsRevise,
  useEventVehicleAssignmentRelease,
  useListEventTask,
  useListPlanningOverride,
  useListPlanningReceipt,
  useListPlanningRule,
  usePlanningReceiptAnswerAgain,
} from "../../../lib/manifest-convex-react";
import {
  suppliesFromText,
  suppliesJson,
  suppliesToText,
  parseSupplies,
} from "../../../lib/planningCapabilities";
import {
  candidateIssues,
  checkEventPlan,
  eventWindow,
  isLiveEvent,
  personName,
  planStatus,
  rigName,
  type PlanCandidate,
  type PlanIssue,
  type PlanStatus,
} from "../../../lib/planningChecks";
import {
  suggestionsForEvent,
  type PlanSuggestion,
} from "../../../lib/planningRules";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import { useActionPrompt } from "../../../ui/action-prompt";
import { QueryLoadState } from "../../../ui/QueryLoadState";
import { useSlowQuery } from "../../../ui/useSlowQuery";
import { useSuccessToast } from "../../../ui/useSuccessToast";
import { resolveManifestPolicies } from "../../admin/rolePermissionAudit";
import { useReserveEquipment } from "../../facilities/equipmentCheckout";
import {
  useAcceptSuggestion,
  useAssignPersonWithReason,
  useAssignRigWithReason,
  useHoldEquipmentWithReason,
} from "../../../lib/useReasonedChanges";
import { addDays, DAY_MS, startOfDay } from "../../home/homeCalendar";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { eventDetailPath } from "../eventRoutes";
import { FailureBanner } from "../FailureBanner";
import { PlanningSchedule } from "./PlanningSchedule";
import { usePlanSnapshot } from "./usePlanSnapshot";
import "./PlanningBoard.css";

type View = "month" | "week" | "day" | "schedule";
type PoolTab = "people" | "trucks" | "trailers" | "equipment";

const VIEWS: ReadonlyArray<{ key: View; label: string }> = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
  { key: "schedule", label: "Who is where" },
];
const POOL_TABS: ReadonlyArray<{ key: PoolTab; label: string }> = [
  { key: "people", label: "People" },
  { key: "trucks", label: "Trucks" },
  { key: "trailers", label: "Trailers" },
  { key: "equipment", label: "Equipment" },
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const POOL_STEP = 40;

const STATUS_WORD: Record<PlanStatus, string> = {
  ready: "Ready",
  look: "Worth a look",
  fix: "Fix first",
};

type Draft =
  | { kind: "person"; personId: string; role: string }
  | { kind: "truck"; vehicleId: string; driverId: string; trailerId: string }
  | { kind: "trailer"; trailerId: string; pulledBy: string; driverId: string }
  | { kind: "equipment"; equipmentId: string; quantity: string };

/** "Fix first · 2" counts only the fix-first items; "Worth a look · 3" all. */
function statusText(issues: readonly PlanIssue[]): string {
  const state = planStatus(issues);
  if (state === "ready") return STATUS_WORD.ready;
  const count =
    state === "fix"
      ? issues.filter((issue) => issue.level === "fix").length
      : issues.length;
  return `${STATUS_WORD[state]} · ${count}`;
}

function dateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function candidateOf(draft: Draft): PlanCandidate {
  switch (draft.kind) {
    case "person":
      return { kind: "person", personId: draft.personId };
    case "truck":
      return { kind: "truck", vehicleId: draft.vehicleId };
    case "trailer":
      return { kind: "trailer", trailerId: draft.trailerId };
    case "equipment":
      return {
        kind: "equipment",
        equipmentId: draft.equipmentId,
        quantity: Math.max(1, Math.round(Number(draft.quantity) || 1)),
      };
  }
}

/**
 * Planning board: the month, week or day of events beside the pool of
 * people, trucks, trailers and equipment. Drag something from the pool onto
 * an event, or press "Put on", and the board shows what that would clash
 * with on every other event before it saves. Every save is the same command
 * the event's own pages use.
 *
 * Nothing here stops a save. A change that leaves a "fix first" item open
 * asks for a reason, and the reason is kept on the event.
 */
export function PlanningBoardPage() {
  const authStatus = useAuthStatus();
  const { loading, snap, levels } = usePlanSnapshot();
  const rules = useListPlanningRule();
  const receipts = useListPlanningReceipt();
  const overrides = useListPlanningOverride();
  const tasks = useListEventTask();

  const assignPerson = useCreateEventAssignment();
  const unassign = useEventAssignmentUnassign();
  const chooseRide = useEventAssignmentChooseTravelLeg();
  const assignRig = useCreateEventVehicleAssignment();
  const releaseRig = useEventVehicleAssignmentRelease();
  const reserveEquipment = useReserveEquipment();
  const cancelHold = useEquipmentReservationCancel();
  const noteNeeds = useCreateEventPlanNeeds();
  const reviseNeeds = useEventPlanNeedsRevise();
  const assignPersonWithReason = useAssignPersonWithReason();
  const acceptSuggestion = useAcceptSuggestion();
  const holdEquipmentWithReason = useHoldEquipmentWithReason();
  const assignRigWithReason = useAssignRigWithReason();
  const recordReceipt = useCreatePlanningReceipt();
  const answerAgain = usePlanningReceiptAnswerAgain();

  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));
  const [view, setView] = useState<View>("month");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [poolTab, setPoolTab] = useState<PoolTab>("people");
  const [poolSearch, setPoolSearch] = useState("");
  const [poolLimit, setPoolLimit] = useState(POOL_STEP);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<Draft | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);
  const { notifySuccess, host: savedToast } = useSuccessToast();
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  // A drop opens the form below the calendar; bring it to the person.
  const putOnForm = useRef<HTMLFormElement>(null);
  const draftSubject = draft
    ? `${draft.kind}:${selectedId ?? ""}:${"personId" in draft ? draft.personId : "vehicleId" in draft ? draft.vehicleId : "trailerId" in draft ? draft.trailerId : draft.equipmentId}`
    : null;
  useEffect(() => {
    if (draftSubject)
      putOnForm.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
  }, [draftSubject]);

  const today = startOfDay(Date.now());
  const days = useMemo(() => {
    const start = new Date(anchor);
    if (view === "month") start.setDate(1);
    if (view === "month" || view === "week")
      start.setDate(start.getDate() - start.getDay());
    const first = startOfDay(start.getTime());
    const count =
      view === "month" ? 42 : view === "week" ? 7 : view === "day" ? 1 : 14;
    return Array.from({ length: count }, (_, index) => addDays(first, index));
  }, [anchor, view]);

  const liveEvents = useMemo(
    () => snap.events.filter(isLiveEvent),
    [snap.events],
  );
  const visible = useMemo(() => {
    const from = days[0]!;
    const to = days[days.length - 1]! + DAY_MS;
    const needle = eventSearch.trim().toLowerCase();
    return liveEvents.filter((event) => {
      if (event.startsAt == null) return false;
      const end = event.endsAt ?? event.startsAt;
      if (end < from || event.startsAt >= to) return false;
      return needle === "" || event.title.toLowerCase().includes(needle);
    });
  }, [liveEvents, days, eventSearch]);

  const issuesByEvent = useMemo(() => {
    const map = new Map<string, PlanIssue[]>();
    for (const event of visible)
      map.set(event._id, checkEventPlan(snap, event._id, levels));
    return map;
  }, [visible, snap, levels]);

  const selected = selectedId
    ? snap.events.find((event) => event._id === selectedId)
    : undefined;
  const selectedIssues = useMemo(
    () => (selected ? checkEventPlan(snap, selected._id, levels) : []),
    [selected, snap, levels],
  );

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const has = (...caps: string[]) => caps.some((cap) => permissions.has(cap));
  const canCrew = has("workforceManageAccess", "eventManageAccess");
  const canRigs = has(
    "eventAccess",
    "salesAccess",
    "logisticsAccess",
    "manageAccess",
  );
  const canEquipment = has(
    "inventoryAccess",
    "logisticsAccess",
    "eventManageAccess",
  );
  // The same people the equipment hold lets book an out-of-service unit.
  const canBookOutOfService = [
    "inventory_manager",
    "logistics_manager",
    "admin",
    "owner",
    "system",
  ].includes(authStatus?.role ?? "");
  const canNeeds = canRigs;
  const canPut = (kind: Draft["kind"]) =>
    kind === "person" ? canCrew : kind === "equipment" ? canEquipment : canRigs;

  // --- The selected event's own records -------------------------------------
  const crew = selected
    ? snap.assignments.filter(
        (row) =>
          row.deletedAt == null &&
          row.eventId === selected._id &&
          !["unassigned", "no_show"].includes(row.status),
      )
    : [];
  const openNeeds = selected
    ? snap.staffNeeds.filter(
        (row) =>
          row.deletedAt == null &&
          row.eventId === selected._id &&
          (row.status === "open" || row.status === "claimed"),
      )
    : [];
  const rigs = selected
    ? snap.rigs.filter(
        (row) => row.deletedAt == null && row.activeEventId === selected._id,
      )
    : [];
  const holds = selected
    ? snap.reservations.filter(
        (row) =>
          row.deletedAt == null &&
          row.eventId === selected._id &&
          ["reserved", "checked_out"].includes(row.status),
      )
    : [];
  const needsRow = selected
    ? snap.planNeeds.find(
        (row) => row.deletedAt == null && row.eventId === selected._id,
      )
    : undefined;
  const person = (id: string | null | undefined) =>
    snap.people.find((row) => row._id === id);
  const vehicle = (id: string | null | undefined) =>
    snap.vehicles.find((row) => row._id === id);
  const trailer = (id: string | null | undefined) =>
    snap.trailers.find((row) => row._id === id);
  const item = (id: string | null | undefined) =>
    snap.equipment.find((row) => row._id === id);
  const rigLabel = (rig: (typeof rigs)[number]) =>
    [
      rig.vehicleId ? rigName(vehicle(rig.vehicleId), "Truck") : null,
      rig.trailerId ? rigName(trailer(rig.trailerId), "Trailer") : null,
      rig.vendorName?.trim() || null,
    ]
      .filter(Boolean)
      .join(" + ") || "Truck";

  const suggestions: PlanSuggestion[] = useMemo(() => {
    if (!selected) return [];
    return suggestionsForEvent({
      guests: Number(selected.expectedHeadcount ?? 0),
      rules: (rules ?? []).map((row) => ({
        ...row,
        trigger: String(row.trigger),
        status: String(row.status),
      })),
      holds,
      equipment: snap.equipment,
      parts: snap.parts,
      positionCount: (role) =>
        snap.staffNeeds.filter(
          (row) =>
            row.deletedAt == null &&
            row.eventId === selected._id &&
            row.status !== "cancelled" &&
            row.role.trim().toLowerCase() === role.trim().toLowerCase(),
        ).length,
      hasTask: (key) =>
        (tasks ?? []).some(
          (row) =>
            row.deletedAt == null &&
            row.eventId === selected._id &&
            row.suggestionKey === key,
        ),
      receipts: (receipts ?? [])
        .filter((row) => row.eventId === selected._id)
        .map((row) => ({ ...row, quantity: Number(row.quantity) })),
    });
    // holds is derived from snap + selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, snap, rules, receipts, tasks]);

  if (loading) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading the planning board"
      />
    );
  }

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    ok: string,
  ): Promise<boolean> => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      notifySuccess(ok);
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const draftName = (value: Draft): string =>
    value.kind === "person"
      ? personName(person(value.personId))
      : value.kind === "truck"
        ? rigName(vehicle(value.vehicleId), "Truck")
        : value.kind === "trailer"
          ? rigName(trailer(value.trailerId), "Trailer")
          : (item(value.equipmentId)?.name ?? "Equipment");

  const startPutOn = (value: Draft, eventId?: string) => {
    if (eventId) setSelectedId(eventId);
    setFailure(null);
    setDraft(value);
  };

  // Which open items a reason can answer. A person on two events or on
  // approved leave, a truck or trailer on two runs, a power, fuel or water
  // gap, and (managers only) equipment that is out of service: the change is
  // saved with its reason, both or neither. A truck or trailer in the shop,
  // or equipment beyond what we own, is refused by the save itself, which
  // says why.
  const answerable = (kind: Draft["kind"], issue: PlanIssue) =>
    issue.level === "fix" &&
    (kind === "person" ||
      ((kind === "truck" || kind === "trailer") &&
        issue.check === "double_booked") ||
      (kind === "equipment" &&
        (issue.check === "supply" ||
          (issue.check === "not_available" && canBookOutOfService))));

  const savePutOn = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!draft || !selected) return;
    const eventId = selected._id;
    const name = draftName(draft);
    const open = candidateIssues(
      snap,
      eventId,
      candidateOf(draft),
      levels,
    ).filter((issue) => answerable(draft.kind, issue));
    let reason: string | null = null;
    if (open.length > 0) {
      reason = await prompt.askReason({
        title: `Put ${name} on the event anyway`,
        description: `${open.map((issue) => issue.text).join(" ")} Say why this is fine; the reason is kept on the event.`,
        label: "Why is this fine?",
        confirmLabel: "Put on anyway",
        tone: "danger",
      });
      if (!reason) return;
    }
    // The change and its reason are saved together: both or neither.
    const kept = reason
      ? {
          action: `Put ${name} on the event`,
          reason,
          openItems: open.map((issue) => issue.text).join("\n"),
        }
      : null;
    const window = eventWindow(selected);
    const saved = await run(
      "put",
      async () => {
        if (draft.kind === "person") {
          if (kept)
            await assignPersonWithReason({
              eventId: eventId as never,
              personId: draft.personId as never,
              role: draft.role.trim(),
              ...kept,
            });
          else
            await assignPerson({
              eventId,
              personId: draft.personId,
              role: draft.role.trim(),
            });
        } else if (draft.kind === "truck" || draft.kind === "trailer") {
          const rig =
            draft.kind === "truck"
              ? {
                  vehicleId: draft.vehicleId,
                  driverId: draft.driverId || undefined,
                  trailerId: draft.trailerId || undefined,
                }
              : {
                  vehicleId: draft.pulledBy,
                  trailerId: draft.trailerId,
                  driverId: draft.driverId || undefined,
                };
          if (kept)
            await assignRigWithReason({
              eventId: eventId as never,
              vehicleId: (rig.vehicleId || undefined) as never,
              trailerId: (rig.trailerId || undefined) as never,
              driverId: rig.driverId as never,
              ...kept,
            });
          else await assignRig({ eventId, ...rig });
        } else {
          if (!window)
            throw new Error(
              "Set the event's date and times before you hold equipment for it.",
            );
          const hold = {
            equipmentId: draft.equipmentId as never,
            eventId: eventId as never,
            startsAt: window.start,
            endsAt: window.end,
            quantity: Math.max(1, Math.round(Number(draft.quantity) || 1)),
          };
          if (kept)
            await holdEquipmentWithReason({
              ...hold,
              bookOutOfService: open.some(
                (issue) => issue.check === "not_available",
              ),
              ...kept,
            });
          else await reserveEquipment(hold);
        }
      },
      `${name} is on the event`,
    );
    if (saved) setDraft(null);
  };

  const accept = (suggestion: PlanSuggestion, take: boolean) => {
    if (!selected) return;
    const eventId = selected._id;
    const window = eventWindow(selected);
    void run(
      `suggest:${suggestion.key}`,
      async () => {
        if (take) {
          if (suggestion.kind === "equipment" && !window)
            throw new Error(
              "Set the event's date and times before you hold equipment for it.",
            );
          // What is added and the answer are one save: both or neither.
          await acceptSuggestion({
            eventId: eventId as never,
            suggestionKey: suggestion.key,
            kind: suggestion.kind,
            target: suggestion.target,
            add: suggestion.add,
            wanted: suggestion.wanted,
            basis: suggestion.basis,
            startsAt: window?.start,
            endsAt: window?.end,
            receiptId: suggestion.receipt?._id as never,
            receiptVersion: suggestion.receipt?.version,
          });
          return;
        }
        const answer = { quantity: 0, declined: true, basis: suggestion.basis };
        if (suggestion.receipt)
          await answerAgain({
            docId: suggestion.receipt._id,
            version: suggestion.receipt.version,
            ...answer,
          });
        else
          await recordReceipt({
            eventId,
            suggestionKey: suggestion.key,
            ...answer,
          });
      },
      take ? `${suggestion.label} added` : "Suggestion turned down",
    );
  };

  const saveNeeds = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!selected) return;
    const data = new FormData(formEvent.currentTarget);
    const trucksRaw = String(data.get("trucksNeeded") ?? "").trim();
    const values = {
      trucksNeeded:
        trucksRaw === "" ? undefined : Math.round(Number(trucksRaw)),
      siteProvidesJson: suppliesJson(
        suppliesFromText(String(data.get("siteProvides") ?? "")),
      ),
    };
    void run(
      "needs",
      () =>
        needsRow
          ? reviseNeeds({
              docId: needsRow._id,
              version: needsRow.version,
              ...values,
            })
          : noteNeeds({ eventId: selected._id, ...values }),
      "Event needs saved",
    );
  };

  // --- Calendar ----------------------------------------------------------------
  const move = (amount: number) => {
    const d = new Date(anchor);
    if (view === "month") {
      d.setDate(1);
      d.setMonth(d.getMonth() + amount);
    } else
      d.setDate(
        d.getDate() +
          amount * (view === "week" ? 7 : view === "schedule" ? 14 : 1),
      );
    setAnchor(startOfDay(d.getTime()));
  };
  const title =
    view === "schedule"
      ? `${new Date(days[0]!).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(days[days.length - 1]!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : view === "day"
        ? new Date(anchor).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : new Date(anchor).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          });
  const anchorMonth = new Date(anchor).getMonth();

  const dropProps = (eventId: string) => ({
    onDragOver: (domEvent: DragEvent<HTMLElement>) => {
      if (!dragging || !canPut(dragging.kind)) return;
      domEvent.preventDefault();
      domEvent.dataTransfer.dropEffect = "copy";
      if (overId !== eventId) setOverId(eventId);
    },
    onDragLeave: () => {
      if (overId === eventId) setOverId(null);
    },
    onDrop: (domEvent: DragEvent<HTMLElement>) => {
      domEvent.preventDefault();
      setOverId(null);
      if (dragging) startPutOn(dragging, eventId);
      setDragging(null);
    },
  });

  // --- Pool --------------------------------------------------------------------
  const needle = poolSearch.trim().toLowerCase();
  type PoolRow = {
    id: string;
    name: string;
    sub: string;
    draft: Draft;
    onEvent: string | null;
    candidate: PlanCandidate;
  };
  const pool: PoolRow[] =
    poolTab === "people"
      ? snap.people
          .filter((row) => row.deletedAt == null && row.status === "active")
          .map((row) => {
            const mine = crew.find((entry) => entry.personId === row._id);
            return {
              id: row._id,
              name: personName(row),
              sub: "Staff",
              draft: { kind: "person", personId: row._id, role: "" } as Draft,
              onEvent: mine ? `On this event · ${mine.role}` : null,
              candidate: { kind: "person", personId: row._id } as PlanCandidate,
            };
          })
      : poolTab === "trucks"
        ? snap.vehicles
            .filter(
              (row) =>
                row.deletedAt == null && row.operationalStatus !== "retired",
            )
            .map((row) => ({
              id: row._id,
              name: `${row.make} ${row.model}`.trim() || "Truck",
              sub: row.registration,
              draft: {
                kind: "truck",
                vehicleId: row._id,
                driverId: "",
                trailerId: "",
              } as Draft,
              onEvent: rigs.some((rig) => rig.vehicleId === row._id)
                ? "On this event"
                : null,
              candidate: { kind: "truck", vehicleId: row._id } as PlanCandidate,
            }))
        : poolTab === "trailers"
          ? snap.trailers
              .filter(
                (row) =>
                  row.deletedAt == null && row.operationalStatus !== "retired",
              )
              .map((row) => ({
                id: row._id,
                name: `${row.make} ${row.model}`.trim() || "Trailer",
                sub: row.registration,
                draft: {
                  kind: "trailer",
                  trailerId: row._id,
                  pulledBy: "",
                  driverId: "",
                } as Draft,
                onEvent: rigs.some((rig) => rig.trailerId === row._id)
                  ? "On this event"
                  : null,
                candidate: {
                  kind: "trailer",
                  trailerId: row._id,
                } as PlanCandidate,
              }))
          : snap.equipment
              .filter((row) => row.deletedAt == null && row.status === "active")
              .map((row) => {
                const held = holds
                  .filter((hold) => hold.equipmentId === row._id)
                  .reduce((sum, hold) => sum + hold.quantity, 0);
                return {
                  id: row._id,
                  name: row.name,
                  sub: `${row.category ?? "Equipment"} · ${row.quantity} owned`,
                  draft: {
                    kind: "equipment",
                    equipmentId: row._id,
                    quantity: "1",
                  } as Draft,
                  onEvent: held > 0 ? `${held} on this event` : null,
                  candidate: {
                    kind: "equipment",
                    equipmentId: row._id,
                    quantity: 1,
                  } as PlanCandidate,
                };
              });
  const shownPool = pool
    .filter(
      (row) =>
        needle === "" ||
        `${row.name} ${row.sub}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const poolState = (row: PoolRow) => {
    if (row.onEvent) return { tone: "on", text: row.onEvent };
    if (!selected) return { tone: "none", text: "Pick an event" };
    const issues = candidateIssues(snap, selected._id, row.candidate, levels);
    if (issues.length === 0) return { tone: "none", text: "Free" };
    return { tone: issues[0]!.level, text: issues[0]!.text };
  };

  const draftIssues =
    draft && selected
      ? candidateIssues(snap, selected._id, candidateOf(draft), levels)
      : [];
  const roleChoices = [
    ...new Set(
      [...snap.assignments, ...snap.staffNeeds]
        .map((row) => row.role.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const drivers = snap.people
    .filter((row) => row.deletedAt == null && row.status === "active")
    .map((row) => ({ id: row._id, name: personName(row) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const status = planStatus(selectedIssues);
  const eventOverrides = selected
    ? (overrides ?? []).filter(
        (row) => row.deletedAt == null && row.eventId === selected._id,
      )
    : [];

  return (
    <div className="event-tracker">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Events · Planning</p>
          <h1 className="font-display mt-1 text-4xl leading-none tracking-tight text-ink">
            Planning board
          </h1>
          <p className="mt-2 max-w-[72ch] text-base text-ink-2">
            Drag a person, truck, trailer or piece of equipment onto an event,
            or pick an event and press Put on. The board checks the change
            against every other event before it saves.
          </p>
        </div>
        <Link to="/events/planning/setup" className="btn btn-ghost">
          Planning setup
        </Link>
      </div>
      {savedToast}
      {host}
      {failure ? (
        <div className="mt-4">
          <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
        </div>
      ) : null}

      <div className="plan-board">
        <section aria-label="Events">
          <div className="plan-bar">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Earlier"
              onClick={() => move(-1)}
            >
              ‹
            </button>
            <strong>{title}</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Later"
              onClick={() => move(1)}
            >
              ›
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAnchor(today)}
            >
              Today
            </button>
            <div className="plan-switch" role="tablist" aria-label="Days shown">
              {VIEWS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={view === entry.key}
                  data-active={view === entry.key || undefined}
                  onClick={() => setView(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              className="input w-auto"
              aria-label="Go to date"
              value={dateInputValue(anchor)}
              onChange={(domEvent) => {
                const next = new Date(`${domEvent.target.value}T00:00:00`);
                if (!Number.isNaN(next.getTime())) setAnchor(next.getTime());
              }}
            />
            <input
              type="search"
              className="input w-48"
              placeholder="Find an event"
              aria-label="Find an event"
              value={eventSearch}
              onChange={(domEvent) => setEventSearch(domEvent.target.value)}
            />
          </div>
          {view === "schedule" ? (
            <PlanningSchedule
              snap={snap}
              days={days}
              kind={poolTab}
              today={today}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="plan-scroll">
              <div className="plan-grid" data-view={view}>
                {view !== "day"
                  ? WEEKDAYS.map((day) => (
                      <div key={day} className="plan-grid-head">
                        {day}
                      </div>
                    ))
                  : null}
                {days.map((day) => {
                  const dayEvents = visible
                    .filter((event) => {
                      const first = startOfDay(event.startsAt!);
                      const last = startOfDay(event.endsAt ?? event.startsAt!);
                      return first <= day && day <= Math.max(first, last);
                    })
                    .sort((a, b) => Number(a.startsAt) - Number(b.startsAt));
                  return (
                    <div
                      key={day}
                      className="plan-day"
                      data-outside={
                        (view === "month" &&
                          new Date(day).getMonth() !== anchorMonth) ||
                        undefined
                      }
                    >
                      <button
                        type="button"
                        className="plan-day-number"
                        data-today={day === today || undefined}
                        aria-label={`Show ${new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
                        onClick={() => {
                          setAnchor(day);
                          setView("day");
                        }}
                      >
                        {view === "day"
                          ? new Date(day).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })
                          : new Date(day).getDate()}
                      </button>
                      <div className="plan-day-events">
                        {dayEvents.map((event) => {
                          const issues = issuesByEvent.get(event._id) ?? [];
                          const state = planStatus(issues);
                          return (
                            <button
                              key={event._id}
                              type="button"
                              className="plan-event"
                              data-status={state}
                              data-selected={
                                selectedId === event._id || undefined
                              }
                              data-over={overId === event._id || undefined}
                              onClick={() => setSelectedId(event._id)}
                              {...dropProps(event._id)}
                            >
                              <span>
                                {formatTime(event.startsAt)}
                                {event.endsAt != null
                                  ? ` – ${formatTime(event.endsAt)}`
                                  : ""}
                              </span>
                              <strong>{event.title}</strong>
                              <span
                                className="plan-event-word"
                                data-status={state}
                              >
                                {statusText(issues)}
                              </span>
                            </button>
                          );
                        })}
                        {view !== "month" && dayEvents.length === 0 ? (
                          <p className="p-2 text-sm text-ink-3">No events.</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="plan-pool" aria-label="Pool">
          <div className="fact-row py-3">
            {POOL_TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={
                  entry.key === poolTab
                    ? "btn btn-primary btn-sm"
                    : "btn btn-ghost btn-sm"
                }
                aria-pressed={entry.key === poolTab}
                onClick={() => {
                  setPoolTab(entry.key);
                  setPoolLimit(POOL_STEP);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="input w-full"
            placeholder="Find in the pool"
            aria-label="Find in the pool"
            value={poolSearch}
            onChange={(domEvent) => {
              setPoolSearch(domEvent.target.value);
              setPoolLimit(POOL_STEP);
            }}
          />
          <p className="mt-2 text-sm text-ink-2">
            {selected
              ? `Shown for ${selected.title}`
              : "Pick an event to see who and what is free."}
          </p>
          <div className="plan-pool-list">
            {shownPool.slice(0, poolLimit).map((row) => {
              const state = poolState(row);
              const allowed = canPut(row.draft.kind);
              return (
                <div
                  key={row.id}
                  className="plan-pool-row"
                  draggable={allowed}
                  onDragStart={(domEvent) => {
                    domEvent.dataTransfer.setData("text/plain", row.id);
                    domEvent.dataTransfer.effectAllowed = "copy";
                    setDragging(row.draft);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverId(null);
                  }}
                >
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.sub}</small>
                    <span className="plan-pool-state" data-tone={state.tone}>
                      {state.text}
                    </span>
                  </div>
                  {allowed ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!selected || busy != null}
                      title={selected ? undefined : "Pick an event first"}
                      onClick={() => startPutOn(row.draft)}
                    >
                      Put on
                    </button>
                  ) : null}
                </div>
              );
            })}
            {shownPool.length === 0 ? (
              <p className="p-3 text-base text-ink-2">Nothing matches.</p>
            ) : null}
            {shownPool.length > poolLimit ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm my-3"
                onClick={() => setPoolLimit((value) => value + POOL_STEP)}
              >
                Show more
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {!selected ? (
        <p className="plan-detail text-base text-ink-2">
          Pick an event to see its crew, trucks and equipment, what is still
          open, and what the planning rules suggest.
        </p>
      ) : (
        <section
          className="plan-detail"
          aria-label={`Plan for ${selected.title}`}
          data-testid="plan-detail"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">
                {selected.startsAt != null
                  ? new Date(selected.startsAt).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "No date"}
              </p>
              <h2 className="font-display text-2xl font-bold text-ink">
                {selected.title}
              </h2>
              <p className="text-base text-ink-2">
                {[
                  selected.startsAt != null
                    ? `${formatTime(selected.startsAt)}${selected.endsAt != null ? ` – ${formatTime(selected.endsAt)}` : ""}`
                    : null,
                  selected.expectedHeadcount != null
                    ? formatCountNoun(selected.expectedHeadcount, "guest")
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`chip normal-case ${status === "fix" ? "chip-tone-danger" : status === "look" ? "chip-tone-warn" : "chip-tone-ok"}`}
              >
                {statusText(selectedIssues)}
              </span>
              <Link
                className="btn btn-ghost btn-sm"
                to={eventDetailPath(selected._id)}
              >
                Open event
              </Link>
            </div>
          </div>

          {draft ? (
            <form
              ref={putOnForm}
              className="mt-4 grid gap-3 rounded-sm border border-line-2 bg-panel p-3 sm:grid-cols-3"
              onSubmit={(formEvent) => void savePutOn(formEvent)}
              aria-label={`Put ${draftName(draft)} on ${selected.title}`}
              data-testid="plan-put-on"
            >
              <p className="text-base font-semibold sm:col-span-3">
                Put {draftName(draft)} on {selected.title}
              </p>
              {draft.kind === "person" ? (
                <label className="field-label">
                  <span>Role on this event</span>
                  <input
                    className="input min-h-10 w-full"
                    list="plan-role-choices"
                    required
                    value={draft.role}
                    onChange={(domEvent) =>
                      setDraft({ ...draft, role: domEvent.target.value })
                    }
                    placeholder="For example: Server"
                  />
                  <datalist id="plan-role-choices">
                    {roleChoices.map((role) => (
                      <option key={role} value={role} />
                    ))}
                  </datalist>
                </label>
              ) : null}
              {draft.kind === "truck" ? (
                <>
                  <label className="field-label">
                    <span>Driver</span>
                    <select
                      className="input min-h-10 w-full"
                      value={draft.driverId}
                      onChange={(domEvent) =>
                        setDraft({ ...draft, driverId: domEvent.target.value })
                      }
                    >
                      <option value="">No driver yet</option>
                      {drivers.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    <span>Trailer</span>
                    <select
                      className="input min-h-10 w-full"
                      value={draft.trailerId}
                      onChange={(domEvent) =>
                        setDraft({ ...draft, trailerId: domEvent.target.value })
                      }
                    >
                      <option value="">No trailer</option>
                      {snap.trailers
                        .filter(
                          (row) =>
                            row.deletedAt == null &&
                            row.operationalStatus !== "retired",
                        )
                        .map((row) => (
                          <option key={row._id} value={row._id}>
                            {rigName(row, "Trailer")}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              ) : null}
              {draft.kind === "trailer" ? (
                <>
                  <label className="field-label">
                    <span>Pulled by</span>
                    <select
                      className="input min-h-10 w-full"
                      required
                      value={draft.pulledBy}
                      onChange={(domEvent) =>
                        setDraft({ ...draft, pulledBy: domEvent.target.value })
                      }
                    >
                      <option value="">Pick a truck</option>
                      {snap.vehicles
                        .filter(
                          (row) =>
                            row.deletedAt == null &&
                            row.operationalStatus !== "retired" &&
                            !rigs.some((rig) => rig.vehicleId === row._id),
                        )
                        .map((row) => (
                          <option key={row._id} value={row._id}>
                            {rigName(row, "Truck")}
                          </option>
                        ))}
                    </select>
                    <small className="text-sm text-ink-2">
                      A truck already on this event is not listed. To give it a
                      trailer, change that truck on the Event tracker sheet.
                    </small>
                  </label>
                  {draft.pulledBy ? (
                    <label className="field-label">
                      <span>Driver</span>
                      <select
                        className="input min-h-10 w-full"
                        value={draft.driverId}
                        onChange={(domEvent) =>
                          setDraft({
                            ...draft,
                            driverId: domEvent.target.value,
                          })
                        }
                      >
                        <option value="">No driver yet</option>
                        {drivers.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}
              {draft.kind === "equipment" ? (
                <label className="field-label">
                  <span>How many</span>
                  <input
                    className="input min-h-10 w-full"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={draft.quantity}
                    onChange={(domEvent) =>
                      setDraft({ ...draft, quantity: domEvent.target.value })
                    }
                  />
                </label>
              ) : null}
              <div className="sm:col-span-3">
                {draftIssues.length === 0 ? (
                  <p className="text-base text-ok">
                    Free for this event. Nothing clashes.
                  </p>
                ) : (
                  <ul className="plan-open">
                    {draftIssues.map((issue) => (
                      <li key={issue.key} data-level={issue.level}>
                        {issue.text}
                        <small>{issue.fix}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-3 sm:col-span-3">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy != null}
                >
                  {busy === "put"
                    ? "Saving…"
                    : draftIssues.some((issue) => answerable(draft.kind, issue))
                      ? "Put on anyway"
                      : "Put on the event"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {selectedIssues.length > 0 ? (
            <ul className="plan-open mt-4" data-testid="plan-open-items">
              {selectedIssues.map((issue) => (
                <li key={issue.key} data-level={issue.level}>
                  {issue.text}
                  <small>
                    {issue.level === "fix" ? "Fix first. " : ""}
                    {issue.fix}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-base text-ok">
              Nothing is open on this event's plan.
            </p>
          )}

          <div className="plan-detail-grid">
            <div>
              <div className="section-rule">
                <span>Trucks</span>
                <i />
                <em>{rigs.length}</em>
              </div>
              <ul className="plan-rows">
                {rigs.map((rig) => {
                  const riders = crew.filter(
                    (row) => row.rideVehicleAssignmentId === rig._id,
                  );
                  return (
                    <li key={rig._id}>
                      <span>
                        {rigLabel(rig)}
                        <small>
                          {rig.vehicleId
                            ? rig.driverId
                              ? `Driver: ${personName(person(rig.driverId))}`
                              : "No driver"
                            : "Outside vendor"}
                          {riders.length > 0
                            ? ` · Riding: ${riders.map((row) => personName(person(row.personId))).join(", ")}`
                            : ""}
                        </small>
                      </span>
                      {canRigs ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            void run(
                              `rig:${rig._id}`,
                              () => releaseRig({ docId: rig._id }),
                              "Truck taken off the event",
                            )
                          }
                        >
                          Take off
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {rigs.length === 0 ? (
                <p className="py-2 text-base text-ink-2">
                  No truck on this event.
                </p>
              ) : null}
            </div>

            <div>
              <div className="section-rule">
                <span>Crew</span>
                <i />
                <em>{crew.length}</em>
              </div>
              <ul className="plan-rows">
                {crew.map((row) => (
                  <li key={row._id}>
                    <span>
                      {personName(person(row.personId))}
                      <small>
                        {row.role} ·{" "}
                        {row.status === "assigned"
                          ? "not confirmed"
                          : row.status.replaceAll("_", " ")}
                      </small>
                    </span>
                    {canCrew ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {rigs.some((rig) => rig.vehicleId) &&
                        ["assigned", "confirmed"].includes(row.status) ? (
                          <select
                            className="input"
                            aria-label={`${personName(person(row.personId))} rides in`}
                            value={row.rideVehicleAssignmentId ?? ""}
                            disabled={busy != null}
                            onChange={(domEvent) =>
                              void run(
                                `ride:${row._id}`,
                                () =>
                                  chooseRide({
                                    docId: row._id,
                                    rideVehicleAssignmentId:
                                      domEvent.target.value || undefined,
                                  }),
                                "Ride saved",
                              )
                            }
                          >
                            <option value="">With the main crew</option>
                            {rigs
                              .filter((rig) => rig.vehicleId)
                              .map((rig) => (
                                <option key={rig._id} value={rig._id}>
                                  Rides in {rigLabel(rig)}
                                </option>
                              ))}
                          </select>
                        ) : null}
                        {["assigned", "confirmed"].includes(row.status) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() =>
                              void run(
                                `crew:${row._id}`,
                                () => unassign({ docId: row._id }),
                                "Taken off the event",
                              )
                            }
                          >
                            Take off
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                ))}
                {openNeeds.map((need) => (
                  <li key={need._id}>
                    <span>
                      Open position
                      <small>{need.role}</small>
                    </span>
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={eventDetailPath(selected._id, "staffing")}
                    >
                      Fill
                    </Link>
                  </li>
                ))}
              </ul>
              {crew.length === 0 && openNeeds.length === 0 ? (
                <p className="py-2 text-base text-ink-2">
                  No crew on this event.
                </p>
              ) : null}
            </div>

            <div>
              <div className="section-rule">
                <span>Equipment</span>
                <i />
                <em>{holds.length}</em>
              </div>
              <ul className="plan-rows">
                {holds.map((hold) => (
                  <li key={hold._id}>
                    <span>
                      {item(hold.equipmentId)?.name ?? "Removed equipment"}
                      <small>
                        {hold.quantity} ·{" "}
                        {hold.status === "checked_out" ? "checked out" : "held"}
                      </small>
                    </span>
                    {canEquipment && hold.status === "reserved" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(
                            `hold:${hold._id}`,
                            () => cancelHold({ docId: hold._id }),
                            "Hold cancelled",
                          )
                        }
                      >
                        Take off
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {holds.length === 0 ? (
                <p className="py-2 text-base text-ink-2">
                  No equipment held for this event.
                </p>
              ) : null}
            </div>
          </div>

          <div className="plan-detail-grid">
            <div className="sm:col-span-2">
              <div className="section-rule">
                <span>Suggested</span>
                <i />
                <em>{suggestions.length}</em>
              </div>
              {suggestions.length === 0 ? (
                <p className="py-2 text-base text-ink-2">
                  Nothing to suggest. Planning rules and the parts that go with
                  equipment show here.
                </p>
              ) : (
                <ul className="plan-rows" data-testid="plan-suggestions">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.key}>
                      <span>
                        {suggestion.kind === "task"
                          ? `To-do: ${suggestion.label}`
                          : `${suggestion.add} more ${suggestion.label}`}
                        <small>
                          {suggestion.reason}
                          {suggestion.kind !== "task"
                            ? ` · ${suggestion.have} on the event, ${suggestion.wanted} suggested`
                            : ""}
                        </small>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={
                            busy != null ||
                            (suggestion.kind === "equipment"
                              ? !canEquipment
                              : suggestion.kind === "position"
                                ? !canCrew
                                : !canNeeds)
                          }
                          onClick={() => accept(suggestion, true)}
                        >
                          {busy === `suggest:${suggestion.key}`
                            ? "Working…"
                            : "Add"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null || !canNeeds}
                          onClick={() => accept(suggestion, false)}
                        >
                          No thanks
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {eventOverrides.length > 0 ? (
                <div className="mt-4">
                  <div className="section-rule">
                    <span>Changes saved with open items</span>
                    <i />
                    <em>{eventOverrides.length}</em>
                  </div>
                  <ul className="plan-rows">
                    {eventOverrides.map((row) => (
                      <li key={row._id}>
                        <span>
                          {row.action}
                          <small>
                            {personName(person(row.recordedByPersonId))}:{" "}
                            {row.reason}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <form
              key={`${selected._id}:${needsRow?.version ?? 0}`}
              onSubmit={saveNeeds}
              aria-label="What this event needs"
            >
              <div className="section-rule">
                <span>What this event needs</span>
                <i />
              </div>
              <label className="field-label mt-2">
                <span>Trucks needed</span>
                <input
                  name="trucksNeeded"
                  type="number"
                  min="0"
                  step="1"
                  className="input min-h-10 w-full"
                  defaultValue={needsRow?.trucksNeeded ?? ""}
                  placeholder="Not said"
                  disabled={!canNeeds}
                />
              </label>
              <label className="field-label mt-2">
                <span>What the site supplies</span>
                <input
                  name="siteProvides"
                  className="input min-h-10 w-full"
                  defaultValue={suppliesToText(
                    parseSupplies(needsRow?.siteProvidesJson),
                  )}
                  placeholder="For example: power:240v x 2, water x 1"
                  disabled={!canNeeds}
                />
              </label>
              <p className="mt-1 text-sm text-ink-2">
                Use the same words as on the equipment (Planning setup), so an
                oven that needs power:240v finds the site's power:240v.
              </p>
              {canNeeds ? (
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm mt-2"
                  disabled={busy != null}
                >
                  {busy === "needs" ? "Saving…" : "Save needs"}
                </button>
              ) : null}
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
