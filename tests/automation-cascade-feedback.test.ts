import { expect, it } from "vitest";
import { AutomationCascadeFeedbackManager } from "../src/features/automation/AutomationCascadeFeedbackManager";

it("reports a truthful approval result with a direct purchasing route", () => {
  const published: Array<{ message: string; actions?: readonly unknown[] }> =
    [];
  const manager = new AutomationCascadeFeedbackManager((message, actions) => {
    published.push({ message, actions });
  });

  manager.eventApproved("event-1");

  expect(published).toEqual([
    {
      message: "Event approved. Purchase planning is up to date.",
      actions: [
        {
          label: "View purchase needs",
          href: "/inventory/purchasing?event=event-1",
        },
      ],
    },
  ]);
});

it("reports the completed stock reduction with a direct stock-line route", () => {
  const published: Array<{ message: string; actions?: readonly unknown[] }> =
    [];
  const manager = new AutomationCascadeFeedbackManager((message, actions) => {
    published.push({ message, actions });
  });

  manager.wasteRecorded("stock-1", 2.5, "kg");

  expect(published[0]).toMatchObject({
    message: "Waste recorded. Stock reduced by 2.5 kg.",
    actions: [{ label: "View stock line" }],
  });
  expect((published[0].actions?.[0] as { href: string }).href).toContain(
    "stock-1",
  );
});
