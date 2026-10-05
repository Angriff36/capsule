/**
 * Runtime proof (AC-314, CF-8.2-01): a venue owns reusable layout templates;
 * an event copies one into its own layout rows. The copy keeps the
 * template's exact type / instructions / order, remembers which template and
 * version it came from, can be edited without touching the template, and a
 * second copy is a separate set of rows.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  M,
  readDoc,
  run,
  seedVenueEvent,
} from "./venue-layout.runtime.helpers";

type Row = {
  _id: string;
  eventId: string;
  type: string;
  instructions?: string | null;
  sortOrder: number;
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: number | null;
  deletedAt?: number | null;
};

const SECTIONS = [
  { type: "Bar", instructions: "Patio, left of the doors", sortOrder: 1 },
  { type: "Buffet", instructions: "North wall", sortOrder: 0 },
  { type: "Kitchen", sortOrder: 2 },
];

describe("runtime proof: venue layout template -> event copy", () => {
  it("copies exactly, stamps the source, never rewrites the template, copies twice independently", async () => {
    const proof = harness();
    const tenantId = "tenant-ac314-layout-copy";
    const { roles, venueId, eventId } = await seedVenueEvent(proof, tenantId);
    const apply = (api.lib as any).safeMaterialization.applyLayoutTemplate;

    const template = await run(
      proof,
      roles.events,
      M.VenueLayoutTemplate_createViaDefine,
      {
        venueId,
        name: "Garden Hall standard",
        sections: JSON.stringify(SECTIONS),
      },
    );
    const before = await readDoc<{ sections: string; version: number }>(
      roles.events,
      template.docId,
    );

    await proof.executeCommand(roles.events, apply, {
      eventId,
      operationKey: "copy-one",
      baseSortOrder: 0,
      sections: [],
      templateId: template.docId,
    });
    const listRows = async () =>
      (
        (await roles.events.query(
          api.queries.listEventLayoutSection,
          {},
        )) as Row[]
      )
        .filter((row) => row.eventId === eventId && row.deletedAt == null)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const first = await listRows();
    expect(
      first.map(({ type, instructions, sortOrder }) => ({
        type,
        instructions: instructions ?? undefined,
        sortOrder,
      })),
    ).toEqual([
      { type: "Buffet", instructions: "North wall", sortOrder: 0 },
      { type: "Bar", instructions: "Patio, left of the doors", sortOrder: 1 },
      { type: "Kitchen", instructions: undefined, sortOrder: 2 },
    ]);
    for (const row of first) {
      expect(row.sourceTemplateId).toBe(template.docId);
      expect(row.sourceTemplateVersion).toBe(before.version);
    }

    // Editing the event's copy leaves the template as it was.
    await proof.executeCommand(roles.events, M.EventLayoutSection_update, {
      docId: first[0]._id,
      instructions: "South wall this time",
    });
    const after = await readDoc<{ sections: string; version: number }>(
      roles.events,
      template.docId,
    );
    expect(after.sections).toBe(before.sections);
    expect(after.version).toBe(before.version);

    // A changed template does not reach back into the earlier copy.
    await proof.executeCommand(roles.events, M.VenueLayoutTemplate_revise, {
      docId: template.docId,
      name: "Garden Hall standard",
      sections: JSON.stringify([{ type: "Dance floor", sortOrder: 0 }]),
    });
    const kept = await listRows();
    expect(kept.map((row) => row.type)).toEqual(["Buffet", "Bar", "Kitchen"]);
    expect(kept[0].instructions).toBe("South wall this time");

    // A second copy is its own set of rows, after the first, from the new version.
    await proof.executeCommand(roles.events, apply, {
      eventId,
      operationKey: "copy-two",
      baseSortOrder: kept.length,
      sections: [],
      templateId: template.docId,
    });
    const both = await listRows();
    expect(both.map((row) => row.type)).toEqual([
      "Buffet",
      "Bar",
      "Kitchen",
      "Dance floor",
    ]);
    expect(both[3].sourceTemplateVersion).toBe(before.version + 1);
    expect(new Set(both.map((row) => row._id)).size).toBe(4);

    // An archived template, or another company's, cannot be copied.
    await proof.executeCommand(roles.events, M.VenueLayoutTemplate_archive, {
      docId: template.docId,
    });
    await expect(
      proof.executeCommand(roles.events, apply, {
        eventId,
        operationKey: "copy-archived",
        baseSortOrder: 4,
        sections: [],
        templateId: template.docId,
      }),
    ).rejects.toThrow(/archived/);
    const other = await seedVenueEvent(proof, "tenant-ac314-other");
    await expect(
      proof.executeCommand(other.roles.events, apply, {
        eventId: other.eventId,
        operationKey: "copy-foreign",
        baseSortOrder: 0,
        sections: [],
        templateId: template.docId,
      }),
    ).rejects.toThrow(/gone/);
  });
});
