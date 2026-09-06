import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deliveryStatusLabel,
  replyDisposition,
} from "../src/features/sales/deliveryHonesty";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("immediate command and delivery honesty", () => {
  it("blocks external replies without creating an outbound row and preserves the draft", () => {
    for (const provider of ["email", "sms", "social", "other"] as const) {
      expect(replyDisposition(provider)).toEqual({
        canRecord: false,
        notice:
          "Cannot send: no external delivery provider is connected. Your draft is preserved; copy it into your email, SMS, or social provider.",
      });
    }

    const page = read("src/features/sales/MessageInboxPage.tsx");
    expect(page).toContain(
      "const disposition = replyDisposition(selected.provider)",
    );
    expect(page).toContain("if (!disposition.canRecord)");
    expect(page.indexOf("if (!disposition.canRecord)")).toBeLessThan(
      page.indexOf("await createMessage({"),
    );
    expect(page).not.toContain(
      'status: selected.provider === "internal" ? "sent" : "queued"',
    );
  });

  it("keeps internal conversation logging usable and honestly named", () => {
    expect(replyDisposition("internal")).toEqual({ canRecord: true });
    const page = read("src/features/sales/MessageInboxPage.tsx");
    expect(page).toContain('status: "sent"');
    expect(page).toMatch(
      /selected\.provider === "internal"\s*\? "Log note"\s*:\s*"Copy draft"/,
    );
    expect(page).toMatch(
      /selected\.provider === "internal"\s*\? "Logging…"\s*:\s*"Copying…"/,
    );
  });

  it("renders historical outbound queued and failed delivery states", () => {
    expect(deliveryStatusLabel("queued")).toBe(
      "Legacy queued — not delivered; no provider is connected",
    );
    expect(deliveryStatusLabel("failed")).toBe(
      "Delivery failed — not delivered",
    );
    expect(deliveryStatusLabel("sent")).toBeNull();
    expect(deliveryStatusLabel("draft")).toBeNull();

    const page = read("src/features/sales/MessageInboxPage.tsx");
    expect(page).toContain("deliveryStatusLabel(String(m.status))");
  });

  it("passes docId to proposal-template commands", () => {
    const page = read("src/features/clients/ProposalTemplatesPage.tsx");
    expect(page).toContain("await revise({\n          docId: id,");
    expect(page).toContain("await archive({ docId: id, reason });");
    expect(page).toContain("await reactivate({ docId: id });");
    expect(page).not.toMatch(
      /await (?:revise|archive|reactivate)\(\{\s*id[,}]/,
    );
  });

  it("labels status-only publication and sent-recording actions honestly", () => {
    const proposals = read("src/features/clients/ProposalsPage.tsx");
    const contracts = read("src/features/clients/ContractsPage.tsx");
    const invoices = read("src/features/finance/InvoicesPage.tsx");
    const invoiceDetail = read("src/features/finance/InvoiceDetailPage.tsx");

    expect(proposals).toMatch(
      /action\.key === "send"\s*\? "Publish proposal"\s*:\s*action\.label/,
    );
    expect(proposals).toContain("Proposal published in Capsule.");
    expect(contracts).toMatch(
      /action\.key === "send"\s*\? "Record sent"\s*:\s*action\.label/,
    );
    expect(contracts).toContain("Contract marked sent in Capsule.");
    expect(invoices).toMatch(
      /action\.key === "send"\s*\? "Record sent"\s*:\s*action\.label/,
    );
    expect(invoices).toContain("marked sent in Capsule");
    expect(invoiceDetail).toMatch(
      /action\.key === "send"\s*\? "Record sent"\s*:\s*action\.label/,
    );
    expect(invoiceDetail).toContain("Invoice marked sent in Capsule.");
  });
});
