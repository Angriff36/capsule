import type { Doc } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { isBelowReorder, stockLineLink } from "../inventory/stockLevels";

/**
 * Client-derived notifications. Capsule reads are live Convex queries, so
 * deriving from row state is already real-time; the compiler does not support
 * child-creating reactions, so there is no generated Notification table to
 * consume (see docs/generation/manifest-builder.md).
 */
export interface AppNotification {
  /** Stable id — read/unread state keys off this. */
  id: string;
  kind:
    | "event_stage"
    | "approval_request"
    | "invoice_overdue"
    | "low_stock"
    | "shift_conflict"
    | "time_off_request"
    | "certification_expiry"
    | "allergen_incident"
    | "staff_message"
    | "mention"
    | "prep_task_comment";
  message: string;
  /** Route to the relevant record. */
  link: string;
  /** When the underlying condition arose (sort key). */
  at: number;
}

export const NOTIFICATION_KIND_LABELS: Record<AppNotification["kind"], string> =
  {
    event_stage: "Event",
    approval_request: "Approval",
    invoice_overdue: "Invoice",
    low_stock: "Stock",
    shift_conflict: "Staffing",
    time_off_request: "Time off",
    certification_expiry: "Certification",
    allergen_incident: "Allergen",
    staff_message: "Message",
    mention: "Mention",
    prep_task_comment: "Prep note",
  };

/** Stage changes older than this are history, not notifications. */
const RECENT_WINDOW_MS = 7 * 86_400_000;

const STAGE_TIMESTAMPS: Array<{
  stage: string;
  field:
    | "approvedAt"
    | "executionStartedAt"
    | "completedAt"
    | "cancelledAt"
    | "closedOutAt";
  label: string;
}> = [
  { stage: "approved", field: "approvedAt", label: "approved" },
  { stage: "executing", field: "executionStartedAt", label: "in execution" },
  { stage: "completed", field: "completedAt", label: "completed" },
  { stage: "cancelled", field: "cancelledAt", label: "cancelled" },
  { stage: "closed_out", field: "closedOutAt", label: "closed out" },
];

const OVERDUE_ELIGIBLE_STATUSES = new Set(["sent", "viewed", "partial"]);

export interface NotificationSources {
  now: number;
  currentAuthSubjectId: string | undefined;
  events: Doc<"events">[] | undefined;
  incidents: Doc<"incidents">[] | undefined;
  invoices: Doc<"invoices">[] | undefined;
  inventoryItems: Doc<"inventoryItems">[] | undefined;
  ingredients: Doc<"ingredients">[] | undefined;
  shifts: Doc<"shifts">[] | undefined;
  people: Doc<"people">[] | undefined;
  qualifications: Doc<"qualifications">[] | undefined;
  timeOffRequests: Doc<"timeOffRequests">[] | undefined;
  vendorOrders: Doc<"vendorOrders">[] | undefined;
  staffMessages: Doc<"staffMessages">[] | undefined;
  prepTaskComments: Doc<"prepTaskComments">[] | undefined;
  /** The caller's own chat read cursors — a mention hides once its channel is read. */
  staffChatReadCursors?: Doc<"staffChatReadCursors">[] | undefined;
  /** Titles for mention channels whose events the caller's role cannot list. */
  mentionEventTitles?: Record<string, string>;
}

/** Staff messages are retained for 90 days; older ones drop out of the UI. */
const MESSAGE_RETENTION_MS = 90 * 86_400_000;

export function deriveNotifications(
  src: NotificationSources,
): AppNotification[] {
  const out: AppNotification[] = [];
  const { now } = src;

  for (const event of src.events ?? []) {
    if (event.deletedAt != null) continue;
    if (event.stage === "pending_approval") {
      out.push({
        id: `event-approval:${event._id}`,
        kind: "approval_request",
        message: `"${event.title}" is awaiting approval`,
        link: `/events/${event._id}`,
        at: event.updatedAt ?? event.createdAt ?? now,
      });
    }
    const entry = STAGE_TIMESTAMPS.find((s) => s.stage === event.stage);
    if (entry) {
      const at = event[entry.field];
      if (at != null && now - at <= RECENT_WINDOW_MS) {
        out.push({
          id: `event-stage:${event._id}:${event.stage}`,
          kind: "event_stage",
          message: `"${event.title}" is now ${entry.label}`,
          link: `/events/${event._id}`,
          at,
        });
      }
    }
  }

  for (const order of src.vendorOrders ?? []) {
    if (order.deletedAt != null) continue;
    if (order.status !== "pending_approval") continue;
    const label = order.orderNumber
      ? `Vendor order ${order.orderNumber}`
      : `Vendor order …${(order._id as string).slice(-8)}`;
    out.push({
      id: `vendor-order-approval:${order._id}`,
      kind: "approval_request",
      message: `${label} (${formatMoney(order.totalAmount)}) is awaiting approval`,
      link: `/inventory/orders/${order._id}`,
      at: order.approvalRequestedAt ?? order.updatedAt ?? now,
    });
  }

  const eventTitles = new Map(
    (src.events ?? []).map((e) => [e._id as string, e.title]),
  );
  for (const incident of src.incidents ?? []) {
    if (incident.deletedAt != null || incident.reportedAt == null) continue;
    if (incident.category !== "allergen") continue;
    if (incident.status !== "open" && incident.status !== "investigating")
      continue;
    const eventTitle =
      eventTitles.get(incident.eventId as string) ?? "an event";
    out.push({
      id: `allergen-incident:${incident._id}`,
      kind: "allergen_incident",
      message: `Allergen incident reported for "${eventTitle}" — corrective action required`,
      link: `/events/${incident.eventId}`,
      at: incident.reportedAt,
    });
  }

  for (const invoice of src.invoices ?? []) {
    if (invoice.deletedAt != null || invoice.amountDue <= 0) continue;
    const overdue =
      invoice.status === "overdue" ||
      (invoice.dueDate != null &&
        invoice.dueDate < now &&
        OVERDUE_ELIGIBLE_STATUSES.has(invoice.status));
    if (!overdue) continue;
    const label = invoice.invoiceNumber
      ? `Invoice ${invoice.invoiceNumber}`
      : "An invoice";
    out.push({
      id: `invoice-overdue:${invoice._id}`,
      kind: "invoice_overdue",
      message: `${label} is overdue — ${formatMoney(invoice.amountDue)} due`,
      link: `/finance/invoices/${invoice._id}`,
      at: invoice.overdueSince ?? invoice.dueDate ?? now,
    });
  }

  const ingredientNames = new Map(
    (src.ingredients ?? []).map((i) => [i._id as string, i.name]),
  );
  for (const item of src.inventoryItems ?? []) {
    if (item.deletedAt != null || item.removedAt != null) continue;
    // Domain semantics (isBelowReorder): a zero threshold means the line is
    // not tracked — no alert. Kills the dead "0 each on hand (reorder at 0)"
    // rows that unconfigured stock lines used to produce. Pass the two
    // quantities explicitly so a server computed cannot override the shared
    // predicate.
    if (
      !isBelowReorder({
        quantityOnHand: item.quantityOnHand,
        reorderThreshold: item.reorderThreshold,
      })
    )
      continue;
    const name =
      ingredientNames.get(item.ingredientId as string) ?? "An ingredient";
    const message =
      item.quantityOnHand <= 0
        ? `${name} is out of stock — reorder point is ${item.reorderThreshold} ${item.unit}`
        : `${name} is low: ${item.quantityOnHand} ${item.unit} on hand — reorder point is ${item.reorderThreshold} ${item.unit}`;
    out.push({
      id: `low-stock:${item._id}`,
      kind: "low_stock",
      message,
      link: stockLineLink(item._id),
      at: item.updatedAt ?? now,
    });
  }

  const personNames = new Map(
    (src.people ?? []).map((p) => [
      p._id as string,
      `${p.givenName} ${p.familyName}`.trim(),
    ]),
  );
  for (const request of src.timeOffRequests ?? []) {
    if (
      src.currentAuthSubjectId == null ||
      request.requesterAuthSubjectId === src.currentAuthSubjectId ||
      request.deletedAt != null ||
      request.status !== "pending" ||
      request.submittedAt == null
    ) {
      continue;
    }
    const who = personNames.get(request.personId as string) ?? "A staff member";
    const range =
      request.startsAt != null && request.endsAt != null
        ? `${formatDate(request.startsAt)} – ${formatDate(request.endsAt - 1)}`
        : "requested dates";
    out.push({
      id: `time-off-request:${request._id}`,
      kind: "time_off_request",
      message: `${who} requested time off · ${range}`,
      link: "/staff/time-off",
      at: request.submittedAt,
    });
  }

  for (const message of src.staffMessages ?? []) {
    if (
      src.currentAuthSubjectId == null ||
      message.recipientAuthSubjectId !== src.currentAuthSubjectId ||
      message.deletedAt != null ||
      message.readAt != null ||
      message.createdAt == null ||
      now - message.createdAt > MESSAGE_RETENTION_MS
    ) {
      continue;
    }
    const who =
      personNames.get(message.senderPersonId as string) ?? "A teammate";
    out.push({
      id: `staff-message:${message._id}`,
      kind: "staff_message",
      message: `New message from ${who}`,
      link: `/staff/messages?dm=${message.senderPersonId}`,
      at: message.createdAt,
    });
  }

  // @mentions in event channels. The body is encrypted and never read here;
  // the sender stamps the mentioned Person ids alongside the message.
  const myPersonId =
    src.currentAuthSubjectId == null
      ? null
      : (((src.people ?? []).find(
          (p) =>
            p.authSubjectId === src.currentAuthSubjectId && p.deletedAt == null,
        )?._id as string | undefined) ?? null);
  if (myPersonId != null) {
    const readUpTo = new Map<string, number>();
    for (const cursor of src.staffChatReadCursors ?? []) {
      if (cursor.authSubjectId !== src.currentAuthSubjectId) continue;
      readUpTo.set(
        cursor.channelKey,
        Math.max(readUpTo.get(cursor.channelKey) ?? 0, cursor.lastReadAt),
      );
    }
    for (const message of src.staffMessages ?? []) {
      if (
        message.deletedAt != null ||
        message.eventId == null ||
        message.createdAt == null ||
        (message.senderPersonId as string) === myPersonId ||
        now - message.createdAt > RECENT_WINDOW_MS
      ) {
        continue;
      }
      const mentioned = (message.mentionedPersonIds ?? "")
        .split(",")
        .map((id) => id.trim());
      if (!mentioned.includes(myPersonId)) continue;
      const eventId = message.eventId as string;
      if ((readUpTo.get(`event:${eventId}`) ?? 0) >= message.createdAt) {
        continue;
      }
      const who =
        personNames.get(message.senderPersonId as string) ?? "A teammate";
      const title =
        eventTitles.get(eventId) ??
        src.mentionEventTitles?.[eventId] ??
        "an event";
      out.push({
        id: `mention:${message._id}`,
        kind: "mention",
        message: `${who} mentioned you in "${title}" chat`,
        link: `/events/${eventId}?tab=chat`,
        at: message.createdAt,
      });
    }
  }

  for (const comment of src.prepTaskComments ?? []) {
    if (
      src.currentAuthSubjectId == null ||
      comment.deletedAt != null ||
      comment.taskOwnerAuthSubjectId == null ||
      comment.taskOwnerAuthSubjectId !== src.currentAuthSubjectId ||
      comment.authorAuthSubjectId === src.currentAuthSubjectId ||
      comment.postedAt == null
    ) {
      continue;
    }
    const who = comment.authorName?.trim() || "A teammate";
    const category = String(comment.category ?? "note");
    const verb =
      category === "blocker"
        ? "reported a blocker on your prep task"
        : category === "substitution"
          ? "logged a substitution on your prep task"
          : category === "status_update"
            ? "updated your prep task"
            : "added a note on your prep task";
    out.push({
      id: `prep-task-comment:${comment._id}`,
      kind: "prep_task_comment",
      message: `${who} ${verb}`,
      link: "/kitchen/prep",
      at: comment.postedAt,
    });
  }

  const certificationWindowEnd = now + 30 * 86_400_000;
  for (const qualification of src.qualifications ?? []) {
    if (
      qualification.deletedAt != null ||
      qualification.status !== "active" ||
      qualification.expiresAt == null ||
      qualification.expiresAt > certificationWindowEnd
    ) {
      continue;
    }
    const who =
      personNames.get(qualification.personId as string) ?? "A staff member";
    const expired = qualification.expiresAt < now;
    out.push({
      id: `certification-expiry:${qualification._id}`,
      kind: "certification_expiry",
      message: expired
        ? `${who}'s ${qualification.name} expired on ${formatDate(qualification.expiresAt)}`
        : `${who}'s ${qualification.name} expires ${formatDate(qualification.expiresAt)}`,
      link: "/staff/qualifications",
      at: qualification.expiresAt,
    });
  }

  const byPerson = new Map<string, Doc<"shifts">[]>();
  for (const shift of src.shifts ?? []) {
    if (shift.deletedAt != null) continue;
    if (shift.status !== "scheduled" && shift.status !== "started") continue;
    if (shift.startsAt == null || shift.endsAt == null) continue;
    const key = shift.personId as string;
    const list = byPerson.get(key);
    if (list) list.push(shift);
    else byPerson.set(key, [shift]);
  }
  for (const [personId, shifts] of byPerson) {
    shifts.sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
    for (let i = 1; i < shifts.length; i++) {
      const prev = shifts[i - 1];
      const cur = shifts[i];
      if ((cur.startsAt ?? 0) >= (prev.endsAt ?? 0)) continue;
      const who = personNames.get(personId) ?? "A staff member";
      out.push({
        id: `shift-conflict:${prev._id}:${cur._id}`,
        kind: "shift_conflict",
        message: `${who} has overlapping shifts on ${formatDate(cur.startsAt)}`,
        link: "/staff/roster",
        at: cur.startsAt ?? now,
      });
    }
  }

  out.sort((a, b) => b.at - a.at);
  return out;
}
