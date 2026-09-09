// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { ClientDetailPage } from "../src/features/clients/ClientDetailPage";
import { ContractsPage } from "../src/features/clients/ContractsPage";
import { ProposalsPage } from "../src/features/clients/ProposalsPage";

const clientId = "nn7ez3fz56ya246m6p17az2ad58crnwg";
it("carries the current client into invoice creation from its account", async () => {
  backend.values.set("useGetClient", {
    _id: clientId,
    clientType: "company",
    companyName: "Harborview",
    status: "active",
    version: 2,
  });
  await mount(
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/clients/:id",
        element: createElement(ClientDetailPage),
      }),
    ),
    `/clients/${clientId}`,
  );
  expect(
    container.querySelector(
      `a[href="/finance/invoices?issue=1&clientId=${clientId}"]`,
    )?.textContent,
  ).toContain("Issue invoice");
});
it("offers invoice creation with the right client and event only for signed contracts", async () => {
  backend.values.set(
    "useListContract",
    ["signed", "draft"].map((status, index) => ({
      _id: `contract-${index}`,
      clientId,
      eventId: "event-a",
      status,
      title: `${status} contract`,
      version: 2,
    })),
  );
  await mount(createElement(ContractsPage));
  const links = container.querySelectorAll(
    'a[href^="/finance/invoices?issue=1"]',
  );
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe(
    `/finance/invoices?issue=1&clientId=${clientId}&eventId=event-a`,
  );
  expect(links[0].closest("tr")?.textContent).toContain("signed contract");
});
it("carries an accepted proposal into event creation and opens an existing booking instead of offering a duplicate", async () => {
  backend.values.set("useListProposal", [
    {
      _id: "proposal-a",
      clientId,
      status: "accepted",
      title: "Harborview supper",
      version: 3,
    },
  ]);
  await mount(createElement(ProposalsPage));
  expect(
    container.querySelector('a[href^="/events/new"]')?.getAttribute("href"),
  ).toBe(`/events/new?clientId=${clientId}&proposalId=proposal-a`);
  backend.values.set("useListProposal", [
    {
      _id: "proposal-a",
      clientId,
      status: "accepted",
      title: "Harborview supper",
      version: 3,
      eventId: "booked-event",
    },
  ]);
  await mount(createElement(ProposalsPage));
  expect(container.querySelector('a[href^="/events/new"]')).toBeNull();
  expect(
    container.querySelector('a[href="/events/booked-event?tab=overview"]')
      ?.textContent,
  ).toBe("View event");
});
