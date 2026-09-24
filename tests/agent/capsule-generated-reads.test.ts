import { describe, expect, it, vi } from "vitest";
import type { WiringContract } from "@angriff36/manifest/projections/wiring";
import { CapsuleGeneratedReadCatalog } from "../../src/agent/CapsuleGeneratedReadCatalog";
import { CapsuleLiveEventPrepStateLoader } from "../../src/agent/CapsuleLiveEventPrepStateLoader";
import { CapsuleQueryClient } from "../../src/agent/CapsuleQueryClient";

describe("generated read consumption", () => {
  const catalog = new CapsuleGeneratedReadCatalog();
  const client = new CapsuleQueryClient(undefined, catalog);

  it("derives a vendor-order list from generated wiring", () => {
    const read = client.contractFor("listVendorOrder");
    expect(read).toMatchObject({
      readId: "VendorOrder.list",
      kind: "list",
      entity: "VendorOrder",
      pagination: "unsupported",
      parameters: [],
    });
    expect(() => client.prepare("listVendorOrder", { cursor: "nope" })).toThrow(
      /does not take a page cursor/,
    );
    expect(client.prepare("listVendorOrder").args).toEqual({});
  });

  it("derives a vendor-order detail from generated wiring", () => {
    const read = client.contractFor("getVendorOrder");
    expect(read).toMatchObject({
      readId: "VendorOrder.get",
      kind: "detail",
      entity: "VendorOrder",
      pagination: "unsupported",
    });
    expect(read.parameters).toEqual([
      expect.objectContaining({ name: "id", required: true }),
    ]);
    expect(() => client.prepare("getVendorOrder", {})).toThrow(
      /requires argument 'id'/,
    );
    expect(client.prepare("getVendorOrder", { id: "order-1" }).args).toEqual({
      id: "order-1",
    });
  });

  it("derives an indexed ingredient-demand read from generated wiring", () => {
    const read = client.contractFor("listIngredientDemandByEventId");
    expect(read).toMatchObject({
      readId: "IngredientDemand.byEventId",
      kind: "indexed",
      entity: "IngredientDemand",
      pagination: "unsupported",
    });
    expect(read.parameters).toEqual([
      expect.objectContaining({ name: "eventId", required: true }),
    ]);
    expect(
      client.prepare("listIngredientDemandByEventId", {
        eventId: "event-1",
        ignored: true,
      }).args,
    ).toEqual({ eventId: "event-1" });
  });

  it("follows generated client-callability for browser callers", () => {
    const visible = catalog.byExportName("listEventDishComponentSeed");
    expect(visible.clientCallable).toBe(true);
    expect(visible.kind).toBe("list");
    const indexed = catalog.byExportName("listEventDishComponentSeedByEventId");
    expect(indexed).toMatchObject({
      kind: "indexed",
      clientCallable: true,
      pagination: "unsupported",
    });
    expect(indexed.parameters.map((parameter) => parameter.name)).toEqual([
      "eventId",
    ]);
    expect(() => client.prepare("listVendorOrder", {}, "client")).toThrow(
      /not client-callable/,
    );
    expect(
      client.prepare("listVendorOrder", {}, "agent").read.clientCallable,
    ).toBe(false);
  });

  it("uses the generated parameter list instead of a second hardcoded one", () => {
    const overridden = new CapsuleQueryClient(
      undefined,
      new CapsuleGeneratedReadCatalog(
        contractWithRequiredRegion() as unknown as WiringContract,
      ),
    );
    expect(() => overridden.prepare("listVendorOrder", {})).toThrow(
      /requires argument 'region'/,
    );
    expect(
      overridden.prepare("listVendorOrder", { region: "west" }).args,
    ).toEqual({ region: "west" });
  });

  it("prep loader asks for the index fields the generated reads declare", async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new CapsuleLiveEventPrepStateLoader(
      { query },
      undefined,
      catalog,
    ).load({ eventId: "event-1", dishId: "dish-1" });
    expect(query).toHaveBeenNthCalledWith(1, expect.anything(), {
      dishId: "dish-1",
    });
    expect(query).toHaveBeenNthCalledWith(2, expect.anything(), {
      eventId: "event-1",
    });
    expect(query).toHaveBeenNthCalledWith(3, expect.anything(), {
      eventId: "event-1",
    });
  });
});

function contractWithRequiredRegion(): unknown {
  const real = new CapsuleGeneratedReadCatalog().byExportName(
    "listVendorOrder",
  );
  return {
    $schema: "manifest-wiring-contract/v1",
    meta: {},
    capabilities: [],
    reads: [
      {
        ...real,
        parameters: [{ name: "region", tsType: "string", required: true }],
      },
    ],
  };
}
