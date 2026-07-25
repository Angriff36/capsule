import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CLIENTS_SECTIONS } from "../src/features/clients/clientsRoutes";
import { CrmLifecyclePolicy } from "../src/features/clients/CrmLifecyclePolicy";
import {
  ContractSignLifecycle,
  ProposalAcceptLifecycle,
  ProposalSendLifecycle,
} from "../src/generated/manifest-wiring-bindings";
import { NAV_AREAS } from "../src/app/nav";

describe("Clients CRM routes and lifecycle bindings", () => {
  it("exposes accounts, proposals, proposal templates, and contracts sections", () => {
    expect(CLIENTS_SECTIONS.map((section) => section.path)).toEqual([
      "/clients",
      "/clients/proposals",
      "/clients/proposals/templates",
      "/clients/contracts",
      "/clients/retention",
    ]);
  });

  it("ships Clients in primary nav without a planned placeholder", () => {
    const clients = NAV_AREAS.find((area) => area.path === "/clients");
    expect(clients?.planned).toBeUndefined();
    expect(clients?.label).toMatch(/Clients/);
  });

  it("wires clients routes in App.tsx", () => {
    const app = readFileSync(
      path.join(process.cwd(), "src/app/App.tsx"),
      "utf8",
    );
    expect(app).toContain('path="/clients"');
    expect(app).toContain('path="/clients/:id"');
    expect(app).toContain('path="/clients/proposals"');
    expect(app).toContain('path="/clients/contracts"');
    expect(app).toContain("ClientsPage");
    expect(app).toContain("ClientDetailPage");
    expect(app).toContain("ProposalsPage");
    expect(app).toContain("ContractsPage");
  });

  it("deep-links Client and signed Contract into invoice issue", () => {
    const detail = readFileSync(
      path.join(process.cwd(), "src/features/clients/ClientDetailPage.tsx"),
      "utf8",
    );
    const contracts = readFileSync(
      path.join(process.cwd(), "src/features/clients/ContractsPage.tsx"),
      "utf8",
    );
    expect(detail).toContain("FINANCE_ROUTES.issueInvoice");
    expect(detail).toContain("useListInvoice");
    expect(contracts).toContain("FINANCE_ROUTES.issueInvoice");
    expect(contracts).toContain('=== "signed"');
  });

  it("deep-links accepted Proposal into Event create with client prefill", () => {
    const proposals = readFileSync(
      path.join(process.cwd(), "src/features/clients/ProposalsPage.tsx"),
      "utf8",
    );
    const create = readFileSync(
      path.join(process.cwd(), "src/features/events/EventCreatePage.tsx"),
      "utf8",
    );
    const routes = readFileSync(
      path.join(process.cwd(), "src/features/events/eventRoutes.ts"),
      "utf8",
    );
    expect(proposals).toContain("eventCreatePath");
    expect(proposals).toContain('=== "accepted"');
    expect(create).toContain("useSearchParams");
    expect(create).toContain('searchParams.get("clientId")');
    expect(routes).toContain("EventCreateLinkBuilder");
  });

  it("derives CRM actions from generated lifecycle metadata", () => {
    const policy = new CrmLifecyclePolicy();
    expect(policy.clientActions("active").map((a) => a.key)).toEqual(
      expect.arrayContaining(["archive"]),
    );
    expect(policy.clientActions("archived").map((a) => a.key)).toEqual(
      expect.arrayContaining(["reactivate"]),
    );
    expect(policy.proposalActions("draft").map((a) => a.key)).toEqual(
      expect.arrayContaining(["send"]),
    );
    expect(policy.proposalActions("sent").map((a) => a.key)).toEqual(
      expect.arrayContaining(["markViewed", "accept", "decline", "expire"]),
    );
    expect(policy.contractActions("viewed").map((a) => a.key)).toEqual(
      expect.arrayContaining(["sign", "expire", "void"]),
    );
    expect(ProposalSendLifecycle[0]?.from).toBe("draft");
    expect(ProposalAcceptLifecycle.map((t) => t.from)).toEqual(
      expect.arrayContaining(["sent", "viewed"]),
    );
    expect(ContractSignLifecycle[0]?.from).toBe("viewed");
  });
});
