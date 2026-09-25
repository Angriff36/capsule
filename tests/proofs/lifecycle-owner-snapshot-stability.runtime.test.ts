/**
 * Runtime proof (AC-398 owner-name snapshot slice): the Event's ownerName is a
 * snapshot of the owner/salesperson's printed name at plan / assign time, not
 * a live link. A later catalog Person_correctIdentity rename must NOT rewrite
 * the Event's ownerName; assignedToId stays the live Person link. planEngagement
 * and assignOwner are the only writers of ownerName; captureDraft /
 * updateImportDraft stay unwired for it.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
const M = api.mutations;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;

function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; owner: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
    owner: proof.asRole({
      subject: `owner-${tenantId}`,
      role: "owner",
      tenantId,
    }),
  };
}

async function hirePerson(
  proof: Proof,
  tenantId: string,
  givenName: string,
  familyName: string,
): Promise<string> {
  const { owner } = rolesFor(proof, tenantId);
  const person = (await proof.executeCommand(owner, M.Person_createViaHire, {
    givenName,
    familyName,
    email: `${givenName}-${familyName}-${tenantId}@proof.example`
      .toLowerCase()
      .replace(/\s+/g, "-"),
    role: "staff",
    employmentType: "full_time",
  })) as { docId: string };
  return person.docId;
}

/** Client + Event carrying an ownerName snapshot for the assigned person. */
async function createEventWithOwner(
  proof: Proof,
  tenantId: string,
  title: string,
  companyName: string,
  personId: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Snapshot",
      budgetAmount: 3000,
      quotedPrice: 4500,
      assignedToId: personId,
      ownerName: "Pat Owner",
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

async function readEvent(
  actor: Role,
  eventId: string,
): Promise<{
  stage: string;
  assignedToId: string | null;
  ownerName: string | null;
  quotedPrice: number;
}> {
  return (await actor.run(async (ctx) => ctx.db.get(eventId as never))) as {
    stage: string;
    assignedToId: string | null;
    ownerName: string | null;
    quotedPrice: number;
  };
}

async function readPerson(
  actor: Role,
  personId: string,
): Promise<{ givenName: string | null; familyName: string | null }> {
  return (await actor.run(async (ctx) => ctx.db.get(personId as never))) as {
    givenName: string | null;
    familyName: string | null;
  };
}

describe("runtime proof: Event owner snapshot stays put under catalog renames", () => {
  it("Person_correctIdentity rename leaves the event owner snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-owner-catalog-edit";
    const { owner, events } = rolesFor(proof, tenantId);
    const personId = await hirePerson(proof, tenantId, "Pat", "Owner");
    const { eventId } = await createEventWithOwner(
      proof,
      tenantId,
      "Owner snapshot holds under catalog rename",
      "Acme Catering",
      personId,
    );

    // A later catalog edit on the Person row via the real rename command.
    await proof.executeCommand(owner, M.Person_correctIdentity, {
      docId: personId,
      version: 1,
      givenName: "Pat",
      familyName: "Owner RENAMED",
    });
    const catalog = await readPerson(events, personId);
    expect(catalog.familyName).toBe("Owner RENAMED");

    const after = await readEvent(events, eventId);
    expect(after.ownerName).toBe("Pat Owner");
    expect(after.assignedToId).toBe(personId);
    expect(after.quotedPrice).toBe(4500);
    expect(after.stage).toBe("planning");
  });

  it("reassignment writes a new snapshot; rename leaves it; clearing the owner clears the snapshot", async () => {
    const proof = harness();
    const tenantId = "tenant-ac398-owner-second-event";
    const { owner, events } = rolesFor(proof, tenantId);
    const patId = await hirePerson(proof, tenantId, "Pat", "Owner");
    const { eventId: firstEvent } = await createEventWithOwner(
      proof,
      tenantId,
      "First owner snapshot holds",
      "Beacon Hospitality",
      patId,
    );
    const { eventId: secondEvent } = await createEventWithOwner(
      proof,
      tenantId,
      "Second owner snapshot holds",
      "Beacon Hospitality II",
      patId,
    );

    // The catalog rename lands after both events; neither snapshot moves.
    await proof.executeCommand(owner, M.Person_correctIdentity, {
      docId: patId,
      version: 1,
      givenName: "Pat",
      familyName: "Owner RENAMED",
    });
    for (const eventId of [firstEvent, secondEvent]) {
      const row = await readEvent(events, eventId);
      expect(row.ownerName).toBe("Pat Owner");
      expect(row.assignedToId).toBe(patId);
    }

    // An explicit reassignment stamps the new person's printed name.
    const kimId = await hirePerson(proof, tenantId, "Kim", "Lead");
    await proof.executeCommand(events, M.Event_assignOwner, {
      docId: firstEvent,
      version: 1,
      assignedToId: kimId,
      ownerName: "Kim Lead",
    });
    const reassigned = await readEvent(events, firstEvent);
    expect(reassigned.assignedToId).toBe(kimId);
    expect(reassigned.ownerName).toBe("Kim Lead");

    // A later rename of Kim leaves the first event's snapshot alone.
    await proof.executeCommand(owner, M.Person_correctIdentity, {
      docId: kimId,
      version: 1,
      givenName: "Kim",
      familyName: "Lead RENAMED",
    });
    const afterKimRename = await readEvent(events, firstEvent);
    expect(afterKimRename.ownerName).toBe("Kim Lead");
    expect(afterKimRename.assignedToId).toBe(kimId);

    // Clearing the owner clears the snapshot with it.
    await proof.executeCommand(events, M.Event_assignOwner, {
      docId: firstEvent,
      version: 2,
    });
    const cleared = await readEvent(events, firstEvent);
    // Convex clears by removing the field, so either absence form counts.
    expect(cleared.assignedToId == null).toBe(true);
    expect(cleared.ownerName == null).toBe(true);

    // The untouched second event keeps Pat's snapshot the whole time.
    const untouched = await readEvent(events, secondEvent);
    expect(untouched.ownerName).toBe("Pat Owner");
    expect(untouched.assignedToId).toBe(patId);
  });
});
