/**
 * Runtime proof (PL-ROUTE-STATES, AC-054 sweep task "vendor order email").
 *
 * - A draft order is not emailed: mark it sent first.
 * - A sent order goes to the vendor's dispatch contact with the items, the
 *   vendor's own item number and amounts, no prices; the send record keeps
 *   the masked address, template and email id.
 * - A second press for the same order the same day sends nothing and says
 *   when and to whom it went.
 * - A refused email names a vendor remedy and shows in the order's list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import {
  harness,
  rolesFor,
  runner,
  type Role,
} from "./buyer-qty-override-survival.runtime.helpers";

const M = api.mutations;

/** The harness role runs actions at runtime; its type only lists commands. */
type ActionCaller = {
  action: <F extends FunctionReference<"action">>(
    fn: F,
    args: FunctionArgs<F>,
  ) => Promise<FunctionReturnType<F>>;
};
const act = (role: Role) => role as unknown as ActionCaller;
const TENANT = "tenant-vendor-order-email";

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("INVOICE_REMINDER_FROM_EMAIL", "orders@proof.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubEmail(state: { status: number }) {
  const sent: Array<{
    to: string[];
    key: string | undefined;
    subject: string;
    text: string;
    html: string;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        _url: string,
        init: { headers?: Record<string, string>; body?: string } = {},
      ) => {
        const body = JSON.parse(String(init.body));
        sent.push({ ...body, key: init.headers?.["Idempotency-Key"] });
        if (state.status !== 200) {
          return Response.json(
            { message: "Email service said no" },
            { status: state.status },
          );
        }
        return Response.json({ id: `email_${sent.length}` });
      },
    ),
  );
  return sent;
}

async function setup() {
  const proof = harness();
  const roles = rolesFor(proof, TENANT);
  const buyer = runner(proof, roles.procurement);
  const kitchen = runner(proof, roles.kitchen);
  const vendor = await buyer(M.Vendor_createViaOnboard, {
    name: "Valley Produce",
    email: "office@valley.example",
  });
  await buyer(M.VendorContact_createViaAdd, {
    vendorId: vendor.docId,
    name: "Billing desk",
    role: "billing",
    email: "billing@valley.example",
  });
  await buyer(M.VendorContact_createViaAdd, {
    vendorId: vendor.docId,
    name: "Dana",
    role: "dispatch",
    email: "dispatch@valley.example",
  });
  const ingredient = await kitchen(M.Ingredient_createViaIntroduce, {
    name: "Shallots",
    unit: "kilogram",
    costPerUnit: 4,
    allergens: [],
    category: "produce",
  });
  await buyer(M.VendorItem_createViaAdd, {
    vendorId: vendor.docId,
    ingredientId: ingredient.docId,
    itemCode: "SH-22",
    description: "Shallots 5 kg bag",
    packQuantity: 5,
    packUnit: "kilogram",
  });
  const order = await buyer(M.VendorOrder_createViaOpen, {
    vendorId: vendor.docId,
  });
  await buyer(M.VendorOrderLine_createViaAddLine, {
    vendorOrderId: order.docId,
    ingredientId: ingredient.docId,
    orderedQuantity: 12.5,
    unit: "kilogram",
    unitCost: 4,
  });
  const vendorOrderId = order.docId as Id<"vendorOrders">;
  return { proof, roles, buyer, vendorOrderId };
}

async function markSent(env: Awaited<ReturnType<typeof setup>>) {
  const row = (await env.roles.procurement.query(api.queries.getVendorOrder, {
    id: env.vendorOrderId,
  })) as { version: number };
  await env.buyer(M.VendorOrder_submit, {
    docId: env.vendorOrderId,
    version: row.version,
  });
}

describe("email the order to the vendor", () => {
  it("refuses a draft, then sends a sent order to the dispatch contact once a day", async () => {
    const env = await setup();
    const sent = stubEmail({ status: 200 });
    const send = () =>
      act(env.roles.procurement).action(api.vendorOrderEmail.send, {
        vendorOrderId: env.vendorOrderId,
      });

    await expect(send()).rejects.toThrow(/Mark the order sent first/);
    expect(sent).toHaveLength(0);

    await markSent(env);
    const result = await send();
    expect(result).toMatchObject({ status: "sent", emailId: "email_1" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["dispatch@valley.example"]);
    expect(sent[0].key).toMatch(
      new RegExp(`^vendor-order-send/${env.vendorOrderId}/`),
    );
    expect(sent[0].text).toContain("Hello Dana,");
    expect(sent[0].text).toContain("Shallots (item SH-22): 12.5 kilogram");
    expect(sent[0].text).not.toMatch(/\$/u);

    const again = await send();
    expect(again.status).toBe("already_sent");
    expect(again.to).toBe(result.to);
    expect(sent).toHaveLength(1);

    const history = await act(env.roles.procurement).action(
      api.vendorOrderEmail.getHistory,
      { vendorOrderId: env.vendorOrderId },
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ outcome: "accepted" });
    expect(history[0].words).toMatch(/Order emailed/);
  });

  it("names a vendor remedy when the email service refuses", async () => {
    const env = await setup();
    await markSent(env);
    stubEmail({ status: 422 });
    await expect(
      act(env.roles.procurement).action(api.vendorOrderEmail.send, {
        vendorOrderId: env.vendorOrderId,
      }),
    ).rejects.toThrow(/Check the vendor's email address/);
    const history = await act(env.roles.procurement).action(
      api.vendorOrderEmail.getHistory,
      { vendorOrderId: env.vendorOrderId },
    );
    expect(history[0]).toMatchObject({ outcome: "failed" });
    expect(history[0].remedy).toMatch(/vendor's email address/);
  });

  it("does not open another company's order", async () => {
    const env = await setup();
    await markSent(env);
    const sent = stubEmail({ status: 200 });
    const outsider = rolesFor(env.proof, "tenant-vendor-order-email-other");
    await expect(
      act(outsider.procurement).action(api.vendorOrderEmail.send, {
        vendorOrderId: env.vendorOrderId,
      }),
    ).rejects.toThrow(/could not find this order/);
    expect(sent).toHaveLength(0);
  });
});
