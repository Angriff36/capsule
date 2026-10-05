/**
 * Runtime proof (#407): Planning setup saves a truck's seats, driver
 * certificate, cargo space and hitch in one save
 * (convex/rigTrailer.ts saveTruckFacts). A refused cargo value keeps nothing:
 * the seats are not half-saved. A good save keeps all four.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: truck facts in one save (#407)", () => {
  it("keeps all of it or none of it", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "truck-facts-owner",
      role: "owner",
      tenantId: "tenant-truck-facts",
    });
    const truck = (
      (await owner.mutation(api.mutations.Vehicle_createViaRegister, {
        make: "Isuzu",
        model: "NPR",
        registration: "TRUCK-F",
        ownership: "owned",
        payloadCapacityKg: 3000,
        operationalStatus: "available",
      })) as { docId: Id<"vehicles"> }
    ).docId;
    const read = () => owner.run((ctx) => ctx.db.get(truck));

    // Seats are fine, cargo space is refused: nothing is kept.
    await expect(
      owner.mutation(api.rigTrailer.saveTruckFacts, {
        vehicleId: truck,
        seatCount: 3,
        driverQualificationName: "Class B",
        cargoVolumeM3: -2,
        hitchType: "50 mm ball",
      }),
    ).rejects.toThrow(/Cargo space can't be negative/);
    const untouched = await read();
    expect(untouched!.seatCount ?? null).toBeNull();
    expect(untouched!.driverQualificationName ?? null).toBeNull();

    // A good save keeps all four.
    await owner.mutation(api.rigTrailer.saveTruckFacts, {
      vehicleId: truck,
      version: untouched!.version,
      seatCount: 3,
      driverQualificationName: "Class B",
      cargoVolumeM3: 18,
      hitchType: "50 mm ball",
    });
    expect(await read()).toMatchObject({
      seatCount: 3,
      driverQualificationName: "Class B",
      cargoVolumeM3: 18,
      hitchType: "50 mm ball",
    });
  }, 60_000);
});
