/**
 * AC-348 (CF-12.1 response recorded): a calendar outage never undoes the
 * person's own work. The event is approved through the real command while
 * Google Calendar answers with errors; the approval stays saved, the sync
 * records "failed" (success is written only from Google's answer), and the
 * next run after Google recovers writes the event once under the same id.
 * Google is a fake fetch; synthetic workspace.
 */
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { encrypt } from "../../convex/lib/encryption";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-cal-outage";
const HOUR = 60 * 60_000;

beforeEach(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "proof-client");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "proof-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://proof.example/callback");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubGoogle(writeStatus: number) {
  const writes: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: unknown }) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return Response.json({
          access_token: "proof-access",
          expires_in: 3600,
        });
      }
      const method = init.method ?? "GET";
      const id =
        method === "POST"
          ? String((JSON.parse(String(init.body)) as { id: string }).id)
          : decodeURIComponent(url.split("/events/")[1]!.split("?")[0]!);
      writes.push(id);
      return writeStatus < 300
        ? Response.json({ id })
        : Response.json(
            { error: { message: "Backend Error" } },
            { status: writeStatus },
          );
    }),
  );
  return writes;
}

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type WithAction = {
  action(fn: unknown, args: Record<string, unknown>): Promise<unknown>;
};

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

const sync = (actor: Actor) =>
  (actor as unknown as WithAction).action(
    internal.googleCalendar.reconcileTenant,
    {
      tenantId: TENANT,
      connectionId: "conn-outage",
      scheduleNext: false,
    },
  ) as Promise<{ status: string; failed: number; createdOrUpdated: number }>;

describe("AC-348 a calendar outage does not undo an approval", () => {
  it("the approval commits while Google fails; the sync says failed and later writes once", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-cal-outage",
      role: "sales_manager",
      tenantId: TENANT,
    });
    const events = proof.asRole({
      subject: "events-cal-outage",
      role: "event_manager",
      tenantId: TENANT,
    });

    const refreshToken = await encrypt("proof-refresh", {
      entity: "GoogleCalendarConnection",
      property: "refreshToken",
    } as Parameters<typeof encrypt>[1]);
    await events.mutation(internal.googleCalendar.recordConnection, {
      tenantId: TENANT,
      connectionId: "conn-outage",
      calendarId: "primary",
      connectedAt: Date.now() - HOUR,
      connectedBy: "proof-manager",
      refreshToken,
    });

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Outage client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Outage lunch",
        eventType: "catering",
        startsAt: Date.now() + 48 * HOUR,
        endsAt: Date.now() + 52 * HOUR,
        expectedHeadcount: 40,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };

    const failedWrites = stubGoogle(503);
    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });
    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });
    expect(await sync(events)).toMatchObject({ status: "partial", failed: 1 });

    const saved = (await events.run(async (ctx) =>
      ctx.db.get(event.docId),
    )) as { stage?: string } | null;
    expect(saved?.stage).toBe("approved");

    const ledger = await events.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    );
    const types = ledger
      .filter((row) => row.entity === "GoogleCalendarEvent")
      .map((row) => row.type);
    expect(types).toEqual(["GoogleCalendarEventSyncFailed"]);

    const writes = stubGoogle(200);
    expect(await sync(events)).toMatchObject({
      status: "ok",
      createdOrUpdated: 1,
    });
    expect(await sync(events)).toMatchObject({ createdOrUpdated: 0 });
    expect(writes).toEqual([failedWrites[0]]);
  });
});
