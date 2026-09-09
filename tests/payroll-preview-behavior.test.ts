// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  container,
  mount,
  command,
  input,
  button,
  click,
} from "./support/mounted-app";
import { PayrollExportPanel } from "../src/features/finance/PayrollExportPanel";
import { buildPayrollExport } from "../src/features/finance/payrollExport";
it("lets payroll staff fix a missing employee number before downloading and flags an unknown hourly rate", async () => {
  const person = {
    _id: "nn7ez3fz56ya246m6p17az2ad58crnwg",
    givenName: "Ada",
    familyName: "Cook",
    version: 3,
  };
  const build = (employeeNumber?: string) =>
    buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-01-09",
      periodEnd: "2026-01-09",
      people: [{ ...person, employeeNumber }],
      timeRecords: [
        {
          personId: person._id,
          clockInAt: new Date("2026-01-09T09:00:00").getTime(),
          clockOutAt: new Date("2026-01-09T14:00:00").getTime(),
          breakMinutes: 0,
          status: "closed",
        },
      ],
      payrollInputs: [],
    });
  const props = {
    loading: false,
    periodStart: "2026-01-09",
    periodEnd: "2026-01-09",
    processor: "gusto" as const,
    onPeriodStartChange: vi.fn(),
    onPeriodEndChange: vi.fn(),
    onProcessorChange: vi.fn(),
    error: null,
    hourlyRateByPersonId: new Map<string, number | null>(),
    onNotice: vi.fn(),
    onFailure: vi.fn(),
  };
  const save = command("personEmployeeNumber:setEmployeeNumber");
  await mount(
    createElement(PayrollExportPanel, { ...props, document: build() }),
  );
  expect(button("Download CSV").disabled).toBe(true);
  expect(container.querySelector("tbody")?.textContent).toContain("Ada Cook");
  expect(container.querySelector("tbody")?.textContent).toContain(
    "No hourly rate set",
  );
  expect(container.querySelector("tbody")?.textContent).not.toContain(
    person._id,
  );
  input("employeeNumber", " EMP-104 ");
  await click(button("Set"));
  expect(save).toHaveBeenCalledExactlyOnceWith({
    docId: person._id,
    employeeNumber: "EMP-104",
    version: undefined,
  });
  expect(props.onFailure).not.toHaveBeenCalled();
  await mount(
    createElement(PayrollExportPanel, { ...props, document: build("EMP-104") }),
  );
  expect(button("Download CSV").disabled).toBe(false);
  expect(container.querySelector("tbody")?.textContent).toContain("EMP-104");
});
