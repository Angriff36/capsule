import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventDishPackaging } from "../../../src/features/events/EventDishPackaging";

const row = (
  id: string,
  serviceStyleId: string,
  owner: { componentId?: string; dishId?: string },
  instructions: string,
  container?: string,
) => ({
  _id: id,
  version: 1,
  serviceStyleId,
  instructions,
  container,
  ...owner,
});

const packaging = [
  row("d-drop", "drop", { dishId: "pasta" }, "Cater wrap and label"),
  row(
    "d-hot",
    "hot",
    { dishId: "pasta" },
    "Chafer, sterno, serve hot",
    "Full pan",
  ),
  row("s-drop", "drop", { componentId: "sauce" }, "Bain marie, cater wrap"),
  row("s-hot", "hot", { componentId: "sauce" }, "Hot box"),
];

const render = (serviceStyleId: string | null) =>
  renderToStaticMarkup(
    createElement(EventDishPackaging, {
      packaging,
      serviceStyleId,
      serviceStyleName: serviceStyleId === "hot" ? "Bring Hot" : "Drop Off",
      dishId: "pasta",
      recipes: [{ id: "sauce", name: "Pomodoro Sauce" }],
    }),
  );

describe("event prep and pack lists show the event's own service style (PL-RECIPE-SHEET part 3)", () => {
  it("a bring-hot event shows only the bring-hot lines, dish first then recipe", () => {
    const html = render("hot");
    expect(html).toContain("Packaging · Bring Hot");
    expect(html).toContain("Chafer, sterno, serve hot (goes out in Full pan)");
    expect(html).toContain("Pomodoro Sauce: Hot box");
    expect(html).not.toContain("Cater wrap");
    expect(html.indexOf("Chafer")).toBeLessThan(html.indexOf("Hot box"));
  });

  it("a drop-off event shows only the drop-off lines", () => {
    const html = render("drop");
    expect(html).toContain("Cater wrap and label");
    expect(html).toContain("Pomodoro Sauce: Bain marie, cater wrap");
    expect(html).not.toContain("Hot box");
  });

  it("an event without a service style shows no packaging", () => {
    expect(render(null)).toBe("");
  });
});
