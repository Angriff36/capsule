import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PrepBoardPage } from "../src/features/production/PrepBoardPage";

const manifest = vi.hoisted(() => ({
  tasks: [] as any[] | undefined,
  dependencies: [] as any[] | undefined,
  checks: [] as any[] | undefined,
  events: [] as any[] | undefined,
  eventDishes: [] as any[] | undefined,
  dishes: [] as any[] | undefined,
  ingredients: [] as any[] | undefined,
  comments: [] as any[] | undefined,
  people: [] as any[] | undefined,
  command: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/manifest-convex-react", () => ({
  useListPrepTask: () => manifest.tasks,
  useListPrepTaskDependency: () => manifest.dependencies,
  useListQualityCheck: () => manifest.checks,
  useListEvent: () => manifest.events,
  useListEventDish: () => manifest.eventDishes,
  useListDish: () => manifest.dishes,
  useListIngredient: () => manifest.ingredients,
  useListPrepTaskComment: () => manifest.comments,
  useListPerson: () => manifest.people,
  useCreatePrepTask: () => manifest.command,
  useCreatePrepTaskDependency: () => manifest.command,
  useCreateQualityCheck: () => manifest.command,
  useCreatePrepTaskComment: () => manifest.command,
  usePrepTaskCancel: () => manifest.command,
  usePrepTaskClaim: () => manifest.command,
  usePrepTaskComplete: () => manifest.command,
  usePrepTaskMarkBlocked: () => manifest.command,
  usePrepTaskRelease: () => manifest.command,
  usePrepTaskStart: () => manifest.command,
  usePrepTaskUnblock: () => manifest.command,
  useQualityCheckFail: () => manifest.command,
  useQualityCheckPass: () => manifest.command,
  useQualityCheckReinspect: () => manifest.command,
}));

vi.mock("../src/features/kitchen/KitchenBookNav", () => ({
  KitchenBookNav: () => null,
}));

vi.mock("../src/features/production/ProductionWorkspaceNav", () => ({
  ProductionWorkspaceNav: () => null,
}));

function renderPage() {
  return renderToStaticMarkup(
    createElement(MemoryRouter, {}, createElement(PrepBoardPage)),
  );
}

describe("PrepBoardPage presentation", () => {
  beforeEach(() => {
    manifest.tasks = [];
    manifest.dependencies = [];
    manifest.checks = [];
    manifest.events = [];
    manifest.ingredients = [];
    manifest.comments = [];
    manifest.people = [];
    manifest.command.mockClear();
  });

  it("presents an empty prep sheet with operational hierarchy and a clear next action", () => {
    const markup = renderPage();

    expect(markup).toContain("Production prep sheet");
    expect(markup).toContain("Finish stations");
    expect(markup).toContain("Blocked lines");
    expect(markup).toContain("Quality checks");
    expect(markup).toContain("The prep sheet is clear");
    expect(markup).toContain("Add first prep task");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-controls="prep-task-form"');
  });

  it("explains what is loading instead of showing an anonymous table skeleton", () => {
    manifest.tasks = undefined;

    const markup = renderPage();

    expect(markup).toContain("Loading the production sheet");
    expect(markup).toContain(
      "Gathering prep lines, event names, ingredients, and quality checks.",
    );
  });

  it("uses an in-page reason workflow instead of blocking browser prompts", () => {
    const source = readFileSync(
      "src/features/production/PrepBoardPage.tsx",
      "utf8",
    );

    expect(source).not.toContain("window.prompt");
    expect(source).toContain("PrepActionReasonForm");
  });
});
