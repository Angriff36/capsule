/**
 * Runtime proof (PL-CATALOGS AC-218, AC-221, AC-222): each TPP service style
 * can be added while booking, an event can be booked with each one, the event
 * list read groups and names them for the events filter and the reports, and
 * a proposal template keeps the style it is for (define and revise).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { SERVICE_STYLE_CATALOG } from "../../src/features/events/serviceStyleCatalog";
import { eventServiceStyleChoices } from "../../src/features/events/eventServiceStyle";

const TENANT = "tenant-service-style-everywhere";
const TPP_STYLES = ["Full Service", "Limited Service", "Drop Off", "Vending"];

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("service style everywhere (AC-218, AC-221, AC-222)", () => {
  it("books one event per TPP style, groups them, and keeps the style on a proposal template", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-style-everywhere",
      role: "owner",
      tenantId: TENANT,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Style client" },
    )) as { docId: string };

    const styleIds = new Map<string, string>();
    for (const name of TPP_STYLES) {
      const row = SERVICE_STYLE_CATALOG.find((style) => style.name === name)!;
      expect(row, name).toBeDefined();
      const { docId } = await owner.mutation(
        api.eventCreateCatalog.ensureBuiltInServiceStyle,
        { name: row.name, code: row.code, sortOrder: row.sortOrder },
      );
      styleIds.set(name, docId);
      await proof.executeCommand(
        owner,
        api.mutations.Event_createViaPlanEngagement,
        {
          clientId: client.docId,
          title: `${name} event`,
          eventType: "catering",
          startsAt: Date.UTC(2026, 10, 2, 17),
          endsAt: Date.UTC(2026, 10, 2, 22),
          expectedHeadcount: 50,
          primaryContactName: "Pat Planner",
          budgetAmount: 2500,
          quotedPrice: 3000,
          serviceStyleId: docId,
          serviceStyleName: name,
        },
      );
    }

    // The same read the events list and the reports use.
    const events = (await owner.query(api.queries.listEvent, {})) as Array<{
      title: string;
      serviceStyleId?: string | null;
      serviceStyleName?: string | null;
      serviceStyle?: { name?: string | null } | null;
    }>;
    expect(events).toHaveLength(4);
    for (const name of TPP_STYLES) {
      expect(
        events.find((event) => event.title === `${name} event`),
      ).toMatchObject({ serviceStyleId: styleIds.get(name) });
    }
    expect(
      eventServiceStyleChoices(events).map(({ label, count }) => [
        label,
        count,
      ]),
    ).toEqual(
      [...TPP_STYLES]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => [name, 1]),
    );

    // Proposal logic: a template made for Drop Off keeps that style.
    const dropOff = styleIds.get("Drop Off")!;
    const template = (await proof.executeCommand(
      owner,
      api.mutations.ProposalTemplate_createViaDefine,
      {
        name: "Drop-off terms",
        defaultTerms: "Food arrives hot in disposable pans; no staff stays.",
        serviceStyleId: dropOff,
      },
    )) as { docId: string };
    const read = async () =>
      (await owner.run(async (ctx) => ctx.db.get(template.docId as never))) as {
        serviceStyleId?: string | null;
        name: string;
      };
    expect((await read()).serviceStyleId).toBe(dropOff);
    await proof.executeCommand(owner, api.mutations.ProposalTemplate_revise, {
      docId: template.docId,
      name: "Drop-off terms (2026)",
      serviceStyleId: dropOff,
    });
    expect(await read()).toMatchObject({
      name: "Drop-off terms (2026)",
      serviceStyleId: dropOff,
    });
  });
});
