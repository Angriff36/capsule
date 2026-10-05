// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EventMapPanel } from "../src/features/events/EventMapPanel";

it("maps an address-only venue with Google, even with a building label first", () => {
  const html = renderToStaticMarkup(
    createElement(EventMapPanel, {
      venue: {
        name: "SEL",
        addressLine1: "2440 BUILDING 2440 NE Hopkins Ct.",
        city: "Pullman",
        region: "WA",
        postalCode: "99163",
      },
    }),
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  const src = container.querySelector("iframe")?.getAttribute("src") ?? "";
  expect(src).toContain("maps.google.com/maps?q=");
  expect(decodeURIComponent(src)).toContain(
    "2440 BUILDING 2440 NE Hopkins Ct., Pullman, WA, 99163",
  );
  expect(container.textContent).not.toContain("could not be located");
});
