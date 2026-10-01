/**
 * AC-369 (CF-15-no-generic-status): every status/stage field moves through
 * named commands. Fields with a one-way life declare `transition` blocks, so
 * the generated runtime refuses any other move from any command. The fields
 * below have no transition table on purpose; each reason is the product rule,
 * and a new status field must be added to one side or the other.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface IrEntity {
  name: string;
  properties: { name: string; type: { name: string } }[];
  transitions?: { property: string }[];
}
interface IrCommand {
  name: string;
  entity: string;
  actions: { kind: string; target?: string }[];
}

const ir = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "generated/ir/merged.ir.json"),
    "utf8",
  ),
) as {
  entities: IrEntity[];
  enums: { name: string }[];
  commands: IrCommand[];
};

/** Status fields without a transition table, and why (2026-10-01). */
const FREE_OR_COMMAND_GUARDED: Record<string, string> = {
  "Candidate.stage":
    "hiring board: a manager moves a candidate to any step; hire, reject and take back are their own commands",
  "Lead.stage": "sales board: a lead moves freely between columns",
  "MessageThread.status": "inbox sorting: active, not a lead, or archived",
  "Message.status":
    "delivery state reported by the sending service, which can arrive out of order",
  "DishTask.stage":
    "where the work happens (kitchen, at the event, pack), not a life stage",
  "ClientPortalLink.status":
    "revoke is guarded to active links; nothing reopens",
  "ShareLink.status": "revoke is guarded to active links; nothing reopens",
  "QuoteSubmission.status":
    "every command guards its starting status (pending, processing, failed)",
  "SyncError.status": "a person marks it fixed or opens it again",
  "CutoverDecision.status":
    "the cutover person records go, no go or roll back at any time",
  "VenueCommissionTerm.status": "retire only; terms are never reactivated",
};

const enumNames = new Set(ir.enums.map((e) => e.name));
const statusFields = ir.entities.flatMap((entity) =>
  entity.properties
    .filter(
      (p) =>
        /^(status|stage|state|lifecycle)$/i.test(p.name) &&
        enumNames.has(p.type.name),
    )
    .map((p) => ({
      key: `${entity.name}.${p.name}`,
      declared: (entity.transitions ?? []).some((t) => t.property === p.name),
    })),
);

describe("status fields move only by named commands", () => {
  it("every status field has a transition table or a recorded reason", () => {
    const undecided = statusFields
      .filter((f) => !f.declared && !(f.key in FREE_OR_COMMAND_GUARDED))
      .map((f) => f.key);
    expect(undecided).toEqual([]);
    expect(statusFields.filter((f) => f.declared).length).toBeGreaterThan(80);
  });

  it("the recorded list has no stale entries", () => {
    const undeclared = new Set(
      statusFields.filter((f) => !f.declared).map((f) => f.key),
    );
    expect(
      Object.keys(FREE_OR_COMMAND_GUARDED).filter((k) => !undeclared.has(k)),
    ).toEqual([]);
  });

  it("no generic update command writes a status field with a transition table", () => {
    const declared = new Set(
      statusFields.filter((f) => f.declared).map((f) => f.key),
    );
    const generic = ir.commands.filter(
      (c) =>
        /^(update|edit|patch|set)$/i.test(c.name) &&
        c.actions.some(
          (a) => a.kind === "mutate" && declared.has(`${c.entity}.${a.target}`),
        ),
    );
    expect(generic.map((c) => `${c.entity}.${c.name}`)).toEqual([]);
  });
});
