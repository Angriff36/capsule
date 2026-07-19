import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function runnerBlock(source: string, runner: string, exported: string): string {
  const start = `async function ${runner}`;
  const end = `export const ${exported} = mutation({`;
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0)
    throw new Error(`Missing generated command block: ${start}`);
  return source.slice(from, to);
}

describe("Event lifecycle reaction projection", () => {
  it("keeps approval and cancellation fan-out payload access flat", () => {
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    const approve = runnerBlock(
      mutations,
      "__runEventApprove",
      "Event_approve",
    );
    const cancel = runnerBlock(mutations, "__runEventCancel", "Event_cancel");
    expect(approve).toContain("payload.eventId");
    expect(cancel).toContain("payload.reason");
    expect(`${approve}\n${cancel}`).not.toContain("payload.payload");
  });

  it("dispatches the known reaction paths through governed command runners", () => {
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    const paths = [
      ["__runEventApprove", "Event_approve", "__runIngredientDemandConfirm"],
      ["__runEventCancel", "Event_cancel", "__runInvoiceMarkVoided"],
      ["__runPaymentSettle", "Payment_settle", "__runInvoiceApplyPayment"],
      [
        "__runQualityCheckFail",
        "QualityCheck_fail",
        "__runPrepTaskMarkBlocked",
      ],
      [
        "__runIngredientDemandConfirm",
        "IngredientDemand_confirm",
        "__runPurchaseNeedCreate",
      ],
      // Submission, not line creation, marks demand-linked needs ordered
      // (owner design decision 2026-07-19 — drafts keep needs open).
      [
        "__runVendorOrderSubmit",
        "VendorOrder_submit",
        "__runPurchaseNeedMarkDraftOrdered",
      ],
    ] as const;

    for (const [runner, exported, targetRunner] of paths) {
      const block = runnerBlock(mutations, runner, exported);
      expect(block).toContain(targetRunner);
      expect(block).not.toContain("ctx.runMutation(api.mutations");
    }
  });
});
