import { describe, expect, it } from "vitest";
import { CapsuleWiringDriftCheck } from "../../src/agent/CapsuleWiringDriftCheck";

const clean = {
  pinnedCompilerVersion: "3.6.56",
  contractCompilerVersion: "3.6.56",
  copyCompilerVersion: "3.6.56",
  contractContentHash: "abc",
  bindingsContractHash: "abc",
  capabilityIds: new Set(["Announcement.post"]),
  readExportNames: new Set(["listVendorOrder"]),
  referencedCapabilityIds: ["Announcement.post"],
  referencedReadExports: ["listVendorOrder"],
};

describe("generated wiring drift checks", () => {
  const check = new CapsuleWiringDriftCheck();

  it("passes a clean generated contract", () => {
    expect(check.contractProblems(clean)).toEqual([]);
    expect(
      check.generationProblems({ dirtyManifests: [], dirtyWiring: [] }),
    ).toEqual([]);
  });

  it("rejects a contract built by a different compiler", () => {
    expect(
      check.contractProblems({
        ...clean,
        contractCompilerVersion: "3.6.55",
        copyCompilerVersion: "3.6.55",
      }),
    ).toEqual(["wiring compiler 3.6.55 does not match pin 3.6.56"]);
  });

  it("rejects a consumer that names a missing command or read", () => {
    expect(
      check.contractProblems({
        ...clean,
        referencedCapabilityIds: ["Announcement.missing"],
        referencedReadExports: ["listMissing"],
      }),
    ).toEqual([
      "missing capability Announcement.missing",
      "missing read listMissing",
    ]);
  });

  it("rejects uncommitted wiring and a manifest change that was not regenerated", () => {
    expect(
      check.generationProblems({
        dirtyManifests: [],
        dirtyWiring: ["src/generated/manifest-wiring-contract.json"],
      })[0],
    ).toMatch(/not committed/);
    expect(
      check.generationProblems({
        dirtyManifests: ["src/events/event.manifest"],
        dirtyWiring: [],
      })[0],
    ).toMatch(/not regenerated/);
  });
});
