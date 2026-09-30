/**
 * Runtime proof (PL-AUTH, AC-403 self-service leg; spec 6.1 item 4): a staff
 * member's "my own work" steps check the staff profile linked to the sign-in,
 * never equality between a staff profile id and the sign-in id. Before this
 * fix Delivery startTransit / confirmDelivery compared the delivery's driver
 * (a staff profile) with the sign-in id, so the assigned driver could never
 * start or finish their own run; PrepTask release compared the task's
 * assignee (set from the staff profile by claim) with the sign-in id, so a
 * cook could never let go of a task they had claimed. Synthetic workspaces.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-self-service-link";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Proof = ReturnType<typeof harness>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

async function hire(
  proof: Proof,
  givenName: string,
  role: string,
  authSubjectId: string,
) {
  const workforce = proof.asRole({
    subject: "self-service-workforce",
    role: "workforce_manager",
    tenantId,
  });
  const hired = (await proof.executeCommand(
    workforce,
    api.mutations.Person_createViaHire,
    {
      givenName,
      familyName: "Proof",
      email: `${authSubjectId}@proof.example`,
      role,
      employmentType: "full_time",
      authSubjectId,
    },
  )) as { docId: string };
  return hired.docId;
}

function seeder(proof: Proof) {
  return proof.asRole({
    subject: "self-service-seed",
    role: "owner",
    tenantId,
  });
}

async function seedEvent(proof: Proof): Promise<string> {
  const eventId = await seeder(proof).run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId,
      clientType: "company",
      companyName: "Self Service Proof Co",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 0,
    });
    return ctx.db.insert("events", {
      tenantId,
      clientId,
      title: "Self service proof dinner",
      eventType: "proof",
      expectedHeadcount: 10,
      budgetAmount: 1000,
      quotedPrice: 1200,
      stage: "approved",
      version: 0,
    });
  });
  return eventId as string;
}

async function row<T>(proof: Proof, id: unknown): Promise<T> {
  return (await seeder(proof).run(async (ctx) => ctx.db.get(id as never))) as T;
}

describe("runtime proof: self-service steps follow the staff profile link (AC-403)", () => {
  it("lets the assigned driver start and finish their own delivery, and no other driver", async () => {
    const proof = harness();
    const driverId = await hire(proof, "Dana", "driver", "self-service-driver");
    await hire(proof, "Eli", "driver", "self-service-other-driver");
    const eventId = await seedEvent(proof);
    const deliveryId = await seeder(proof).run(async (ctx) => {
      const packListId = await ctx.db.insert("packLists", {
        tenantId,
        eventId,
        name: "Main load",
        status: "packed",
        version: 0,
      } as never);
      return ctx.db.insert("deliveries", {
        tenantId,
        packListId,
        eventId,
        driverId,
        destination: "1 Shore Road",
        windowStartsAt: Date.UTC(2026, 9, 1, 14),
        windowEndsAt: Date.UTC(2026, 9, 1, 15),
        scheduledAt: Date.UTC(2026, 9, 1, 12),
        status: "scheduled",
        version: 1,
      } as never);
    });

    const driver = proof.asRole({
      subject: "self-service-driver",
      role: "driver",
      tenantId,
    });
    const otherDriver = proof.asRole({
      subject: "self-service-other-driver",
      role: "driver",
      tenantId,
    });
    // A sign-in with no staff profile whose sign-in id is the driver's
    // profile id: id equality used to be the whole test.
    const lookalike = proof.asRole({
      subject: driverId,
      role: "driver",
      tenantId,
    });

    for (const caller of [otherDriver, lookalike]) {
      expect(
        await refused(() =>
          proof.executeCommand(caller, api.mutations.Delivery_startTransit, {
            docId: deliveryId,
            version: 1,
          }),
        ),
      ).toBe(true);
    }
    expect((await row<{ status: string }>(proof, deliveryId)).status).toBe(
      "scheduled",
    );

    await proof.executeCommand(driver, api.mutations.Delivery_startTransit, {
      docId: deliveryId,
      version: 1,
    });
    expect(
      await refused(() =>
        proof.executeCommand(
          otherDriver,
          api.mutations.Delivery_confirmDelivery,
          { docId: deliveryId, version: 2 },
        ),
      ),
    ).toBe(true);
    await proof.executeCommand(driver, api.mutations.Delivery_confirmDelivery, {
      docId: deliveryId,
      version: 2,
    });
    expect((await row<{ status: string }>(proof, deliveryId)).status).toBe(
      "delivered",
    );
  });

  it("lets a cook release a prep task they claimed, and no other cook", async () => {
    const proof = harness();
    const cookId = await hire(
      proof,
      "Avery",
      "kitchen_staff",
      "self-service-cook",
    );
    await hire(proof, "Blake", "kitchen_staff", "self-service-other-cook");
    const eventId = await seedEvent(proof);
    const prepTaskId = await seeder(proof).run(async (ctx) => {
      const dishId = await ctx.db.insert("dishes", {
        tenantId,
        name: "Self Service Proof Dish",
        portionSize: 1,
        portionUnit: "portion",
        dietaryTags: [],
        status: "active",
        version: 0,
      });
      const eventDishId = await ctx.db.insert("eventDishes", {
        tenantId,
        eventId,
        dishId,
        quantityServings: 10,
        version: 0,
      });
      return ctx.db.insert("prepTasks", {
        tenantId,
        eventDishId,
        eventId,
        dishId,
        name: "Dice shallots",
        category: "mise",
        taskType: "prep",
        isGenerated: false,
        quantity: 1,
        unit: "each",
        status: "pending",
        version: 0,
      });
    });

    const cook = proof.asRole({
      subject: "self-service-cook",
      role: "kitchen_staff",
      tenantId,
    });
    const otherCook = proof.asRole({
      subject: "self-service-other-cook",
      role: "kitchen_staff",
      tenantId,
    });

    await proof.executeCommand(cook, api.mutations.PrepTask_claim, {
      docId: prepTaskId,
      version: 0,
    });
    const claimed = await row<{ assignedToId: string; version: number }>(
      proof,
      prepTaskId,
    );
    expect(claimed.assignedToId).toBe(cookId);

    expect(
      await refused(() =>
        proof.executeCommand(otherCook, api.mutations.PrepTask_release, {
          docId: prepTaskId,
          version: claimed.version,
        }),
      ),
    ).toBe(true);

    await proof.executeCommand(cook, api.mutations.PrepTask_release, {
      docId: prepTaskId,
      version: claimed.version,
    });
    const released = await row<{
      status: string;
      assignedToId?: string | null;
    }>(proof, prepTaskId);
    expect(released.status).toBe("pending");
    expect(released.assignedToId ?? null).toBeNull();
  });

  it("lets kitchen, driver and crew read the shared event and its menu, but not change the event (spec 6.1 item 6)", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof);
    const eventDishId = await seeder(proof).run(async (ctx) => {
      const dishId = await ctx.db.insert("dishes", {
        tenantId,
        name: "Shared Event Proof Dish",
        portionSize: 1,
        portionUnit: "portion",
        dietaryTags: [],
        status: "active",
        version: 0,
      });
      return ctx.db.insert("eventDishes", {
        tenantId,
        eventId,
        dishId,
        quantityServings: 10,
        addedAt: Date.UTC(2026, 8, 1),
        version: 0,
      });
    });

    for (const role of ["kitchen_staff", "driver", "workforce_staff"]) {
      const subject = `self-service-shared-${role}`;
      await hire(proof, role, role, subject);
      const caller = proof.asRole({ subject, role, tenantId });
      const event = (await caller.query(api.queries.getEvent, {
        id: eventId,
      })) as { _id: string } | null;
      expect(event?._id, role).toBe(eventId);
      const dish = (await caller.query(api.queries.getEventDish, {
        id: eventDishId,
      })) as { _id: string } | null;
      expect(dish?._id, role).toBe(eventDishId);
      expect(
        await refused(() =>
          proof.executeCommand(caller, api.mutations.Event_changeHeadcount, {
            docId: eventId,
            version: 0,
            newHeadcount: 99,
          }),
        ),
        role,
      ).toBe(true);
    }
    expect(
      (await row<{ expectedHeadcount: number }>(proof, eventId))
        .expectedHeadcount,
    ).toBe(10);

    // The event manager may change it.
    const managerSubject = "self-service-shared-event-manager";
    await hire(proof, "Morgan", "event_manager", managerSubject);
    await proof.executeCommand(
      proof.asRole({
        subject: managerSubject,
        role: "event_manager",
        tenantId,
      }),
      api.mutations.Event_changeHeadcount,
      { docId: eventId, version: 0, newHeadcount: 12 },
    );
    expect(
      (await row<{ expectedHeadcount: number }>(proof, eventId))
        .expectedHeadcount,
    ).toBe(12);
  });
});
