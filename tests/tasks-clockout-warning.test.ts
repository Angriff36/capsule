/**
 * Acceptance proof for the clock-out blocker query
 * (convex/tasks.openAndDueTodayForPerson). The query is what MyDayPage
 * consumes to show the "you still have open tasks" modal. It must:
 *
 *  - return tasks whose status is pending OR in_progress
 *  - exclude tasks whose dueAt falls outside today's local-day window
 *  - exclude tasks whose status is completed / cancelled
 *  - exclude soft-deleted tasks
 *  - exclude tasks from a different tenant
 *  - return [] for an anonymous viewer
 *
 * Tasks are seeded directly via the proof harness's `seedEntity` (raw
 * ctx.db.insert, bypasses the policy guard). The query is the unit under
 * test, not the create mutation; that path is covered by the manifest
 * integration guards.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./proofs/convex-test-modules";

const TENANT = "tenant-task-clockout-warning";
const OTHER_TENANT = "tenant-task-clockout-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Proof = ReturnType<typeof harness>;

function asManager(proof: Proof, tenantId: string, subject = "manager") {
  return proof.asRole({ subject, role: "workforce_manager", tenantId });
}

function asStaff(proof: Proof, tenantId: string, subject = "staff") {
  return proof.asRole({ subject, role: "staff", tenantId });
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function seedPerson(proof: Proof, tenantId: string, subject: string) {
  const manager = asManager(proof, tenantId);
  return proof.executeCommand(manager, api.mutations.Person_createViaHire, {
    givenName: subject,
    familyName: "Test",
    email: `${subject}@example.com`,
    role: "staff",
  }) as Promise<{ docId: string }>;
}

async function seedTask(
  proof: Proof,
  tenantId: string,
  personId: string,
  task: {
    title: string;
    dueAt: number;
    status?: "pending" | "in_progress" | "completed" | "cancelled";
    deletedAt?: number;
  },
) {
  const actor = asManager(proof, tenantId, "task-seeder");
  return proof.seedEntity(actor, "tasks", {
    tenantId,
    deletedAt: task.deletedAt ?? null,
    assignedToId: personId,
    createdById: personId,
    title: task.title,
    description: null,
    dueAt: task.dueAt,
    status: task.status ?? "pending",
    completedAt: task.status === "completed" ? Date.now() : null,
    cancelledAt: task.status === "cancelled" ? Date.now() : null,
    cancellationReason: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  }) as Promise<string>;
}

async function queryClockOutWarning(
  proof: Proof,
  tenantId: string,
  subject: string,
  personId: string,
) {
  const viewer = asStaff(proof, tenantId, subject);
  return viewer.query(api.tasks.openAndDueTodayForPerson, {
    personId: personId as never,
  }) as Promise<
    { _id: string; title: string; dueAt: number; status: string }[]
  >;
}

describe("tasks.openAndDueTodayForPerson", () => {
  it("returns pending and in_progress tasks due today, in due-time order", async () => {
    const proof = harness();
    const person = await seedPerson(proof, TENANT, "alpha");
    const personId = person.docId;

    const today0900 = startOfToday() + 9 * 60 * 60 * 1000;
    const today1700 = startOfToday() + 17 * 60 * 60 * 1000;
    await seedTask(proof, TENANT, personId, {
      title: "Pending morning task",
      dueAt: today0900,
      status: "pending",
    });
    await seedTask(proof, TENANT, personId, {
      title: "In-progress afternoon task",
      dueAt: today1700,
      status: "in_progress",
    });

    const rows = await queryClockOutWarning(
      proof,
      TENANT,
      "alpha-viewer",
      personId,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("Pending morning task");
    expect(rows[1]?.title).toBe("In-progress afternoon task");
  });

  it("excludes completed and cancelled tasks", async () => {
    const proof = harness();
    const person = await seedPerson(proof, TENANT, "beta");
    const personId = person.docId;
    const today1000 = startOfToday() + 10 * 60 * 60 * 1000;

    await seedTask(proof, TENANT, personId, {
      title: "Already done",
      dueAt: today1000,
      status: "completed",
    });
    await seedTask(proof, TENANT, personId, {
      title: "Cancelled",
      dueAt: today1000,
      status: "cancelled",
    });
    await seedTask(proof, TENANT, personId, {
      title: "Still open",
      dueAt: today1000,
      status: "pending",
    });

    const rows = await queryClockOutWarning(
      proof,
      TENANT,
      "beta-viewer",
      personId,
    );
    expect(rows.map((r) => r.title)).toEqual(["Still open"]);
  });

  it("excludes soft-deleted tasks", async () => {
    const proof = harness();
    const person = await seedPerson(proof, TENANT, "gamma");
    const personId = person.docId;
    const today1200 = startOfToday() + 12 * 60 * 60 * 1000;

    await seedTask(proof, TENANT, personId, {
      title: "Soft-deleted open task",
      dueAt: today1200,
      status: "pending",
      deletedAt: Date.now(),
    });
    await seedTask(proof, TENANT, personId, {
      title: "Live open task",
      dueAt: today1200,
      status: "pending",
    });

    const rows = await queryClockOutWarning(
      proof,
      TENANT,
      "gamma-viewer",
      personId,
    );
    expect(rows.map((r) => r.title)).toEqual(["Live open task"]);
  });

  it("excludes tasks due outside today's local-day window", async () => {
    const proof = harness();
    const person = await seedPerson(proof, TENANT, "delta");
    const personId = person.docId;
    const today1200 = startOfToday() + 12 * 60 * 60 * 1000;
    const tomorrow1200 = startOfToday() + 36 * 60 * 60 * 1000;

    await seedTask(proof, TENANT, personId, {
      title: "Yesterday's leftover",
      dueAt: today1200 - 24 * 60 * 60 * 1000,
      status: "pending",
    });
    await seedTask(proof, TENANT, personId, {
      title: "Tomorrow's task",
      dueAt: tomorrow1200,
      status: "pending",
    });
    await seedTask(proof, TENANT, personId, {
      title: "Today",
      dueAt: today1200,
      status: "pending",
    });

    const rows = await queryClockOutWarning(
      proof,
      TENANT,
      "delta-viewer",
      personId,
    );
    expect(rows.map((r) => r.title)).toEqual(["Today"]);
  });

  it("excludes tasks from a different tenant", async () => {
    const proof = harness();
    const person = await seedPerson(proof, TENANT, "epsilon");
    const personId = person.docId;
    const today1000 = startOfToday() + 10 * 60 * 60 * 1000;

    await seedTask(proof, TENANT, personId, {
      title: "Right tenant",
      dueAt: today1000,
      status: "pending",
    });
    await seedTask(proof, OTHER_TENANT, personId, {
      title: "Wrong tenant",
      dueAt: today1000,
      status: "pending",
    });

    const rows = await queryClockOutWarning(
      proof,
      TENANT,
      "epsilon-viewer",
      personId,
    );
    expect(rows.map((r) => r.title)).toEqual(["Right tenant"]);
  });

  it("returns an empty list for an anonymous viewer", async () => {
    const proof = harness();
    const person = await seedPerson(proof, TENANT, "zeta");
    const personId = person.docId;
    await seedTask(proof, TENANT, personId, {
      title: "Anonymous view of open task",
      dueAt: startOfToday() + 10 * 60 * 60 * 1000,
      status: "pending",
    });

    const anon = proof.asRole({
      subject: "anon",
      role: "anonymous",
      tenantId: TENANT,
    });
    const rows = (await anon.query(api.tasks.openAndDueTodayForPerson, {
      personId: personId as never,
    })) as unknown[];

    expect(rows).toEqual([]);
  });
});
