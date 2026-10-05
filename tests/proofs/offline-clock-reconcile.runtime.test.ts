/**
 * PL-OFFLINE-TIME (AC-127, PR09-06): a clock tap saved on the phone keeps its
 * own idempotencyKey through a reload. When the server applied it but the
 * answer was lost, the resend returns the first result - one time entry, not
 * two - and the phone's queue clears only when the server has answered.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  harness,
  rolesFor,
  runner,
} from "./headcount-staffing-reconciliation.runtime.helpers";
import {
  drainQueue,
  enqueueAction,
  loadQueue,
  sendAction,
} from "../../src/features/staff/offlineStore";

const M = api.mutations;
const TENANT = "tenant-offline-clock";
const SCOPE = `${TENANT}:kit`;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ??=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe("offline clock reconcile (AC-127)", () => {
  it("an offline clock-in replayed with the same idempotencyKey creates exactly one time record and the queue clears only on ack", async () => {
    const proof = harness();
    const { workforce } = rolesFor(proof, TENANT);
    const kit = await runner(proof, workforce)(M.Person_createViaHire, {
      givenName: "Kit",
      familyName: "Offline",
      email: "kit@offline.example",
      role: "event_staff",
      employmentType: "part_time",
      authSubjectId: `${TENANT}-kit`,
    });
    const self = runner(
      proof,
      proof.asRole({
        subject: `${TENANT}-kit`,
        role: "event_staff",
        tenantId: TENANT,
      }),
    );
    const records = async () =>
      (
        (await workforce.run(async (ctx) =>
          ctx.db.query("timeRecords").collect(),
        )) as Doc<"timeRecords">[]
      ).filter((row) => row.personId === kit.docId);
    const clockIn = (args: Record<string, unknown>) =>
      self(M.TimeRecord_createViaClockIn, args);

    // No signal at the venue door: the tap is saved on the phone.
    const queued = enqueueAction(
      {
        runKey: "clock-in",
        label: "Clock in",
        args: { personId: kit.docId, timeZone: "America/Chicago" },
      },
      SCOPE,
    );
    expect(loadQueue(SCOPE)).toHaveLength(1);
    expect(await records()).toHaveLength(0);

    // The signal comes back; the send reaches the server and is saved, but
    // the answer never arrives (tab reloaded). The queue must still hold it.
    await clockIn({ ...queued.args, idempotencyKey: queued.idempotencyKey });
    expect(await records()).toHaveLength(1);
    expect(loadQueue(SCOPE)).toHaveLength(1);

    // A resend that fails on the way keeps the tap queued, with the reason.
    await drainQueue(
      {
        "clock-in": async () => {
          throw new Error("Network went away");
        },
      },
      SCOPE,
    );
    expect(loadQueue(SCOPE)).toEqual([
      expect.objectContaining({
        idempotencyKey: queued.idempotencyKey,
        lastError: "Network went away",
      }),
    ]);

    // After the reload the queue resends the SAME key: the server returns the
    // first entry, and only then does the queue clear.
    await drainQueue({ "clock-in": clockIn }, SCOPE);
    expect(loadQueue(SCOPE)).toHaveLength(0);
    const [entry] = await records();
    expect(await records()).toHaveLength(1);
    expect(entry!.status).toBe("open");
    expect(entry!.timeZone).toBe("America/Chicago");

    // Online taps go through the same queue: a server refusal (already
    // clocked in) leaves nothing pending and nothing new.
    await expect(
      sendAction(
        {
          runKey: "clock-in",
          label: "Clock in",
          args: { personId: kit.docId },
        },
        clockIn,
        SCOPE,
      ),
    ).rejects.toThrow(/already clocked in/);
    expect(loadQueue(SCOPE)).toHaveLength(0);
    expect(await records()).toHaveLength(1);

    // An online clock-out is saved, answered, and cleared.
    await sendAction(
      {
        runKey: "clock-out",
        label: "Clock out",
        args: { docId: entry!._id, version: entry!.version, breakMinutes: 30 },
      },
      (args) => self(M.TimeRecord_clockOut, args),
      SCOPE,
    );
    expect(loadQueue(SCOPE)).toHaveLength(0);
    const [closed] = await records();
    expect(closed!.status).toBe("closed");
    expect(closed!.breakMinutes).toBe(30);
  });
});
