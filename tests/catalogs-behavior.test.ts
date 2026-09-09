// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  button,
  click,
  submit,
} from "./support/mounted-app";
import { CatalogsPage } from "../src/features/admin/CatalogsPage";

it.each([
  ["ServiceStyle", "service style"],
  ["Occasion", "occasion"],
  ["ReferralSource", "referral source"],
])(
  "maintains %s through the real admin form and lifecycle actions",
  async (entity, singular) => {
    const row = {
      _id: "catalog-a",
      name: "Existing",
      code: "existing",
      sortOrder: 2,
      description: "Original",
      status: "active",
      version: 7,
    };
    backend.values.set(`useList${entity}`, [row]);
    const register = command(`useCreate${entity}`);
    const revise = command(`use${entity}ReviseDetails`);
    const retire = command(`use${entity}Deactivate`);
    const activate = command(`use${entity}Activate`);
    await mount(createElement(CatalogsPage));
    const form = button(`Add ${singular}`).closest("form")!;
    input("name", "  Evening service  ", form);
    input("code", "evening", form);
    input("sortOrder", "8", form);
    input("description", "After sunset", form);
    await submit(form);
    expect(register).toHaveBeenCalledExactlyOnceWith({
      name: "Evening service",
      code: "evening",
      sortOrder: 8,
      description: "After sunset",
    });
    expect(container.textContent).toContain("Evening service added");
    await click(button("Rename"));
    const prompt = container.querySelector<HTMLFormElement>(
      "[data-action-prompt]",
    )!;
    input("name", "Renamed", prompt);
    input("sortOrder", "9", prompt);
    input("description", "Updated", prompt);
    await submit(prompt);
    expect(revise).toHaveBeenCalledExactlyOnceWith({
      docId: "catalog-a",
      version: 7,
      name: "Renamed",
      sortOrder: 9,
      description: "Updated",
    });
    await click(button("Retire"));
    expect(retire).not.toHaveBeenCalled();
    input("reason", "Replaced by evening service");
    await submit(
      container.querySelector<HTMLFormElement>("[data-action-prompt]")!,
    );
    expect(retire).toHaveBeenCalledExactlyOnceWith({
      docId: "catalog-a",
      version: 7,
      reason: "Replaced by evening service",
    });
    backend.values.set(`useList${entity}`, [
      { ...row, status: "inactive", version: 8 },
    ]);
    await mount(createElement(CatalogsPage));
    await click(button("Reactivate"));
    expect(activate).toHaveBeenCalledExactlyOnceWith({
      docId: "catalog-a",
      version: 8,
    });
  },
);
