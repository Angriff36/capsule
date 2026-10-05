/**
 * AC-638, AC-643..AC-652, AC-705 (BE-18.2, BE-18.6, BE-20.5): the ten screen
 * areas have a written read/action contract built from the code, and no
 * screen calls a function or a generated action that does not exist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UI_AREAS,
  UI_CONTRACT_DOC,
  buildAreaContracts,
  capabilityFor,
  functionKind,
  renderUiContract,
} from "../scripts/ui-contract";

const contracts = buildAreaContracts();

describe("screen read and action contract", () => {
  it("covers all ten screen areas from the spec", () => {
    expect(UI_AREAS.map((area) => area.id)).toEqual([
      "lead-client",
      "proposal",
      "event-overview",
      "menu-kitchen",
      "timeline",
      "staffing-my-day",
      "pack-warehouse",
      "rentals-decor",
      "final-lock-packet",
      "billing-closeout",
    ]);
  });

  it.each(contracts.map((c) => [c.area.title, c] as const))(
    "%s: screens read live data and run real actions",
    (_title, contract) => {
      expect(contract.files.length).toBeGreaterThan(0);
      const authoredReads = contract.authoredCalls.filter(
        (ref) => functionKind(ref) === "query",
      );
      const authoredSteps = contract.authoredCalls.filter((ref) =>
        ["mutation", "action"].includes(functionKind(ref)),
      );
      expect(contract.reads.length + authoredReads.length).toBeGreaterThan(0);
      expect(contract.commands.length + authoredSteps.length).toBeGreaterThan(
        0,
      );
    },
  );

  it("no screen calls a missing function or an action without wiring facts", () => {
    const missing = contracts.flatMap((c) =>
      c.missing.map((ref) => `${c.area.title}: ${ref}`),
    );
    expect(missing).toEqual([]);
    for (const contract of contracts) {
      for (const ref of contract.commands) {
        const facts = capabilityFor(ref.slice("mutations.".length));
        expect(facts, ref).not.toBeNull();
        expect(typeof facts!.capability.acceptsIdempotencyKey).toBe("boolean");
      }
    }
  });

  it(`${UI_CONTRACT_DOC} is current (rebuild: bun scripts/ui-contract.ts)`, () => {
    const written = readFileSync(
      join(import.meta.dirname, "..", UI_CONTRACT_DOC),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(written).toBe(renderUiContract(contracts));
  });
});
