import { describe, expect, it } from "vitest";

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
      "/clients/quote-requests",
      "/clients/inbox",
    ]);
  });

  it("ships Clients in primary nav", () => {
    const clients = NAV_AREAS.find((area) => area.path === "/clients");
    expect(clients).toBeDefined();
    expect(clients?.label).toMatch(/Clients/);
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
