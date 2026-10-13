/**
 * The review form offers only the events the person worked (a shift or a
 * roster assignment) in the last six months, not every event the company ever booked.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const M = api.mutations;
const DAY = 86_400_000;

describe("review events for a person", () => {
  it("lists only recent events the person worked", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const admin = proof.asRole({
      subject: "review-events-admin",
      role: "admin",
      tenantId: "tenant-review-events",
    });
    const hire = async (givenName: string) =>
      (
        (await proof.executeCommand(admin, M.Person_createViaHire, {
          givenName,
          familyName: "Crew",
          email: `${givenName.toLowerCase()}@example.test`,
        })) as { docId: string }
      ).docId;
    const riley = await hire("Riley");
    const sam = await hire("Sam");
    const client = (
      (await proof.executeCommand(admin, M.Client_createViaRegister, {
        clientType: "company",
        companyName: "Review Events Co",
      })) as { docId: string }
    ).docId;
    const event = async (title: string, startsAt: number) =>
      (
        (await proof.executeCommand(admin, M.Event_createViaPlanEngagement, {
          clientId: client,
          title,
          eventType: "corporate",
          startsAt,
          endsAt: startsAt + 5 * 3_600_000,
          expectedHeadcount: 40,
          primaryContactName: "Contact",
          budgetAmount: 0,
          quotedPrice: 0,
        })) as { docId: string }
      ).docId;
    const now = Date.now();
    const recent = await event("Recent gala", now - 10 * DAY);
    const old = await event("Old picnic", now - 300 * DAY);
    const others = await event("Sam's lunch", now - 5 * DAY);
    const ahead = await event("Next week dinner", now + 7 * DAY);
    const rostered = await event("Rostered brunch", now - 3 * DAY);
    const shift = (personId: string, eventId: string, startsAt: number) =>
      proof.executeCommand(admin, M.Shift_createViaSchedule, {
        personId,
        eventId,
        startsAt,
        endsAt: startsAt + 5 * 3_600_000,
      });
    await shift(riley, recent, now - 10 * DAY);
    await shift(riley, old, now - 300 * DAY);
    await shift(riley, ahead, now + 7 * DAY);
    await shift(sam, others, now - 5 * DAY);
    // A roster assignment that follows the event's timing counts too.
    await proof.executeCommand(admin, M.EventAssignment_createViaAssign, {
      eventId: rostered,
      personId: riley,
      role: "Server",
    });

    const rows = (await admin.query(
      api.workforceHistoryWindow.reviewEventsForPerson,
      { personId: riley },
    )) as Array<{ _id: string; title: string }>;
    expect(rows.map((row) => row.title)).toEqual([
      "Rostered brunch",
      "Recent gala",
    ]);
  });
});
