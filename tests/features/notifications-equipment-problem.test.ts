import { describe, expect, it } from "vitest";
import {
  deriveNotifications,
  type NotificationSources,
} from "../../src/features/notifications/deriveNotifications";

const sources = (
  overrides: Partial<NotificationSources>,
): NotificationSources => ({
  now: 1_700_000_000_000,
  currentAuthSubjectId: "user-a",
  currentPersonId: "person-a",
  events: [],
  incidents: [],
  invoices: [],
  inventoryItems: [],
  ingredients: [],
  shifts: [],
  people: [],
  qualifications: [],
  timeOffRequests: [],
  vendorOrders: [],
  staffMessages: [],
  prepTaskComments: [],
  ...overrides,
});

const issue = (fields: Record<string, unknown>) =>
  ({
    _id: "issue-1",
    equipmentId: "urn-1",
    status: "open",
    severity: "high",
    description: "Spigot leaks",
    raisedAt: 1_699_999_000_000,
    issueRaisedById: "person-b",
    deletedAt: null,
    ...fields,
  }) as never;

describe("equipment problems reach the bell", () => {
  it("an open problem tells others, names the item, and links to equipment", () => {
    const out = deriveNotifications(
      sources({
        equipmentIssues: [issue({})],
        equipmentNames: { "urn-1": "Coffee Urn" },
      }),
    );
    expect(out).toEqual([
      {
        id: "equipment-problem:issue-1",
        kind: "equipment_problem",
        message: "Urgent: Coffee Urn: Spigot leaks",
        link: "/facilities/equipment",
        at: 1_699_999_000_000,
      },
    ]);
  });

  it("the reporter and sorted-out problems are not told", () => {
    const out = deriveNotifications(
      sources({
        equipmentIssues: [
          issue({ issueRaisedById: "person-a" }),
          issue({ _id: "issue-2", status: "resolved" }),
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it("overdue truck or equipment service reaches the bell as upkeep", () => {
    const out = deriveNotifications(
      sources({
        maintenanceDue: [
          {
            id: "vehicle:s1:100",
            name: "WA 1 Dodge Ram",
            task: "Oil change",
            link: "/logistics/maintenance",
            at: 100,
          },
        ],
      }),
    );
    expect(out).toEqual([
      {
        id: "maintenance-due:vehicle:s1:100",
        kind: "maintenance_due",
        message: "WA 1 Dodge Ram: Oil change is overdue",
        link: "/logistics/maintenance",
        at: 100,
      },
    ]);
  });
});

describe("quote request notifications", () => {
  it("a website quote request waits in the bell until someone answers it", () => {
    const quote = (fields: Record<string, unknown>) =>
      ({
        _id: "quote-1",
        status: "pending",
        clientName: "Marcus Lee",
        guestCount: 45,
        submittedAt: 1_699_999_500_000,
        ...fields,
      }) as never;
    const out = deriveNotifications(
      sources({
        quoteSubmissions: [
          quote({}),
          quote({ _id: "quote-2", status: "completed" }),
        ],
      }),
    ).filter((row) => row.kind === "quote_request");
    expect(out).toEqual([
      expect.objectContaining({
        message: "Marcus Lee asked for a quote · 45 guests",
        link: "/clients/quote-requests",
      }),
    ]);
  });
});

describe("shift swap notifications", () => {
  const swap = (fields: Record<string, unknown>) =>
    ({
      _id: "swap-1",
      _creationTime: 1_699_999_000_000,
      shiftId: "shift-1",
      requesterPersonId: "person-b",
      recipientPersonId: "person-a",
      status: "pending_recipient",
      createdAt: 1_699_999_000_000,
      ...fields,
    }) as never;

  it("tells the coworker they were asked, and the manager when both agreed", () => {
    const asked = deriveNotifications(
      sources({ shiftSwaps: [swap({})] }),
    ).filter((row) => row.kind === "shift_swap");
    expect(asked).toEqual([
      expect.objectContaining({
        message: "A coworker asked you to take their shift",
        link: "/my",
      }),
    ]);

    const toApprove = deriveNotifications(
      sources({
        currentPersonId: "manager-1",
        shiftSwaps: [swap({ status: "awaiting_manager" })],
      }),
    ).filter((row) => row.kind === "shift_swap");
    expect(toApprove).toEqual([
      expect.objectContaining({ link: "/staff/swaps" }),
    ]);

    // The person who asked is not told about their own request.
    expect(
      deriveNotifications(
        sources({
          currentPersonId: "person-b",
          shiftSwaps: [swap({ status: "awaiting_manager" })],
        }),
      ).filter((row) => row.kind === "shift_swap"),
    ).toEqual([]);
  });
});
