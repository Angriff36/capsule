/**
 * Runtime proof (PL-PACK-RULES): AC-132 applying a template is previewable
 * and retry-safe, a revised template shows what changed and never touches a
 * line someone set by hand; AC-340 a packed event list stays exactly as it
 * was when the template changes later.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { PACK_LIST_UNITS } from "../../src/features/logistics/packListUnits";
import {
  parseTemplateLines,
  previewTemplateApplication,
} from "../../src/lib/packTemplateLines";
import {
  createPlannedEvent,
  harness,
  line,
  openPackList,
  packLines,
  readRow,
  rolesFor,
  runner,
  version,
  type PackLine,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const items = (rows: Array<[string, number]>) =>
  JSON.stringify(
    rows.map(([description, requiredQuantity]) => ({
      description,
      requiredQuantity,
      unit: "each",
    })),
  );

async function seed(tenantId: string) {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const { eventId } = await createPlannedEvent(
    proof,
    tenantId,
    "Template lineage",
  );
  const packListId = await openPackList(
    proof,
    tenantId,
    eventId,
    "Template list",
  );
  const run = runner(proof, roles.logistics);
  const template = await run(M.PackListTemplate_createViaDefine, {
    name: "Buffet basics",
    items: items([
      ["Chafer", 4],
      ["Sterno can", 8],
    ]),
  });
  let key = 0;
  const apply = () =>
    proof.executeCommand(
      roles.logistics,
      api.lib.safeMaterialization.applyPackTemplate,
      {
        packListId,
        packListTemplateId: template.docId,
        operationKey: `apply-${tenantId}-${key++}`,
        items: [],
      } as never,
    ) as Promise<{ itemCount: number; recovered: boolean }>;
  const revise = async (rows: Array<[string, number]>) =>
    run(M.PackListTemplate_revise, {
      docId: template.docId,
      name: "Buffet basics",
      items: items(rows),
      version: await version(roles.owner, template.docId),
    });
  return {
    proof,
    roles,
    run,
    packListId,
    templateId: template.docId,
    apply,
    revise,
  };
}

describe("runtime proof: template lineage", () => {
  it("the apply step previews the added lines and a revised template exposes changed requirements without touching edited rows (AC-132)", async () => {
    const tenantId = "tenant-pack-template-preview";
    const s = await seed(tenantId);
    const template = await readRow<{ items: string; version: number }>(
      s.roles.owner,
      s.templateId,
    );
    const firstPreview = previewTemplateApplication({
      templateId: s.templateId,
      templateVersion: template.version,
      lines: parseTemplateLines(template.items, PACK_LIST_UNITS),
      listLines: [],
    });
    expect(firstPreview.map((row) => [row.description, row.state])).toEqual([
      ["Chafer", "add"],
      ["Sterno can", "add"],
    ]);

    await s.apply();
    await s.apply(); // an interrupted apply run again: no second copy
    let lines = await packLines(s.roles.owner, tenantId, s.packListId);
    expect(lines.map((row) => [row.description, row.requiredQuantity])).toEqual(
      [
        ["Chafer", 4],
        ["Sterno can", 8],
      ],
    );
    await s.run(M.PackListItem_adjustQuantity, {
      docId: line(lines, "Sterno can")._id,
      requiredQuantity: 10,
    });

    await s.revise([
      ["Chafer", 6],
      ["Sterno can", 12],
      ["Serving spoon", 5],
    ]);
    const revised = await readRow<{ items: string; version: number }>(
      s.roles.owner,
      s.templateId,
    );
    lines = await packLines(s.roles.owner, tenantId, s.packListId);
    const preview = previewTemplateApplication({
      templateId: s.templateId,
      templateVersion: revised.version,
      lines: parseTemplateLines(revised.items, PACK_LIST_UNITS),
      listLines: lines,
    });
    expect(
      preview.map((row) => [
        row.description,
        row.state,
        row.listQuantity,
        row.templateQuantity,
        row.templateChanged,
      ]),
    ).toEqual([
      ["Chafer", "update", 4, 6, true],
      ["Sterno can", "keptEdit", 10, 12, true],
      ["Serving spoon", "add", null, 5, false],
    ]);

    await s.apply();
    lines = await packLines(s.roles.owner, tenantId, s.packListId);
    expect(lines.map((row) => [row.description, row.requiredQuantity])).toEqual(
      [
        ["Chafer", 6],
        ["Serving spoon", 5],
        ["Sterno can", 10],
      ],
    );
  });

  it("regenerating from a revised template leaves the finalized event pack list byte-identical (AC-340)", async () => {
    const tenantId = "tenant-pack-template-final";
    const s = await seed(tenantId);
    await s.apply();
    await s.run(M.PackList_startPacking, {
      docId: s.packListId,
      version: await version(s.roles.owner, s.packListId),
    });
    for (const row of await packLines(s.roles.owner, tenantId, s.packListId))
      await s.run(M.PackListItem_markPacked, {
        docId: row._id,
        packedQuantity: row.requiredQuantity,
      });
    await s.run(M.PackList_markPacked, {
      docId: s.packListId,
      version: await version(s.roles.owner, s.packListId),
    });
    const before: PackLine[] = await packLines(
      s.roles.owner,
      tenantId,
      s.packListId,
    );

    await s.revise([
      ["Chafer", 9],
      ["Sterno can", 20],
      ["Serving spoon", 5],
    ]);
    await expect(s.apply()).rejects.toThrow(/already packed/);
    const after = await packLines(s.roles.owner, tenantId, s.packListId);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
