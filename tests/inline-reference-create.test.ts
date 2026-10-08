// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  backend,
  button,
  click,
  command,
  change,
  container,
  field,
  input,
  mount,
  submit,
} from "./support/mounted-app";
import { InlineReferenceCreateSheet } from "../src/ui/InlineReferenceCreateSheet";
import { canCreateInlineReference } from "../src/ui/InlineReferenceCreateSheet";
import { SearchSelect } from "../src/ui/SearchSelect";

it("creates a missing reference by keyboard without submitting its parent form", async () => {
  const create = vi.fn();
  const parentSubmit = vi.fn((event: Event) => event.preventDefault());
  await mount(
    createElement(
      "form",
      { onSubmit: parentSubmit },
      createElement(SearchSelect, {
        options: [{ id: "client-a", label: "Acme Catering" }],
        value: "",
        onChange: vi.fn(),
        onCreate: create,
        "aria-label": "Client",
      }),
    ),
  );
  const picker =
    container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => picker.focus());
  change(picker, "Acme");
  expect(container.textContent).not.toContain("Create");
  change(picker, "Missing");
  await act(async () => {
    picker.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    picker.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(create).toHaveBeenCalledWith("Missing");
  expect(parentSubmit).not.toHaveBeenCalled();
});

it("creates a missing reference on a real mouse click", async () => {
  const create = vi.fn();
  await mount(
    createElement(SearchSelect, {
      options: [],
      value: "",
      onChange: vi.fn(),
      onCreate: create,
      "aria-label": "Client",
    }),
  );
  const picker =
    container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => picker.focus());
  change(picker, "Missing");
  const createOption = container.querySelector<HTMLElement>('[role="option"]')!;
  await click(createOption);
  expect(create).toHaveBeenCalledWith("Missing");
});

it("creates a missing client in the sheet and returns its id for picker selection", async () => {
  const createClient = command("useCreateClient", { docId: "client-new" });
  const onCreated = vi.fn();
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "client",
      open: true,
      initialName: "New Client",
      existingOptions: [],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated,
    }),
  );
  const sheet = document.body;
  input("name", "New Client", sheet);
  await submit(sheet.querySelector("form")!);
  expect(createClient).toHaveBeenCalledWith(
    expect.objectContaining({
      clientType: "company",
      companyName: "New Client",
      idempotencyKey: expect.any(String),
    }),
  );
  expect(onCreated).toHaveBeenCalledWith({
    id: "client-new",
    label: "New Client",
  });
  expect(backend.values.get("authStatus:getAuthStatus")).toMatchObject({
    role: "owner",
  });
});

it("keeps a two-word company whole when its guessed person type is switched back", async () => {
  const createClient = command("useCreateClient", { docId: "client-new" });
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "client",
      open: true,
      initialName: "Blue Apron",
      existingOptions: [],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated: vi.fn(),
    }),
  );
  const sheet = document.body;
  // Guessed a person and split; switching to company puts it back together.
  expect(field("clientType", sheet).value).toBe("person");
  change(field("clientType", sheet), "company");
  await submit(sheet.querySelector("form")!);
  expect(createClient).toHaveBeenCalledWith(
    expect.objectContaining({
      clientType: "company",
      companyName: "Blue Apron",
    }),
  );
});

it("requires a fresh duplicate confirmation after the identity changes", async () => {
  const createClient = command("useCreateClient", { docId: "client-new" });
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "client",
      open: true,
      initialName: "Zeta",
      existingOptions: [
        { id: "acme", label: "Acme Catering" },
        { id: "beta", label: "Beta Catering" },
      ],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated: vi.fn(),
    }),
  );
  const sheet = document.body;
  input("name", "Acme Catering", sheet);
  expect(sheet.textContent).toContain("A similar client already exists.");
  await submit(sheet.querySelector("form")!);
  expect(createClient).not.toHaveBeenCalled();
  await click(button("Create anyway", sheet));
  await submit(sheet.querySelector("form")!);
  expect(createClient).toHaveBeenCalledTimes(1);
  input("name", "Beta Catering", sheet);
  expect(sheet.textContent).toContain("A similar client already exists.");
  await submit(sheet.querySelector("form")!);
  expect(createClient).toHaveBeenCalledTimes(1);
});

it("matches people by full name and returns the full selected label", async () => {
  const createClient = command("useCreateClient", { docId: "jane-new" });
  const onCreated = vi.fn();
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "client",
      open: true,
      initialName: "Jane",
      existingOptions: [
        { id: "jane-existing", label: "Jane Smith" },
        { id: "email-match", label: "Different", email: "jane@example.com" },
      ],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated,
    }),
  );
  const sheet = document.body;
  change(field("clientType", sheet), "person");
  input("familyName", "Smith", sheet);
  expect(sheet.textContent).toContain("A similar client already exists.");
  await click(button("Create anyway", sheet));
  await submit(sheet.querySelector("form")!);
  expect(createClient).toHaveBeenCalledWith(
    expect.objectContaining({
      givenName: "Jane",
      familyName: "Smith",
    }),
  );
  expect(onCreated).toHaveBeenCalledWith({
    id: "jane-new",
    label: "Jane Smith",
  });
});

it("keeps a different person surname out of the duplicate warning", async () => {
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "client",
      open: true,
      initialName: "Jane",
      existingOptions: [{ id: "jane-smith", label: "Jane Smith" }],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated: vi.fn(),
    }),
  );
  const sheet = document.body;
  change(field("clientType", sheet), "person");
  input("familyName", "Jones", sheet);
  expect(sheet.textContent).not.toContain("A similar client already exists.");
});

it("flags a matching client email even when the name differs", async () => {
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "client",
      open: true,
      initialName: "New Name",
      existingOptions: [
        { id: "existing", label: "Existing Name", email: "same@example.com" },
      ],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated: vi.fn(),
    }),
  );
  input("email", "same@example.com", document.body);
  expect(document.body.textContent).toContain(
    "A similar client already exists.",
  );
});

it("uses the selected duplicate instead of creating another record", async () => {
  const onUseExisting = vi.fn();
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "vendor",
      open: true,
      initialName: "Acme",
      existingOptions: [{ id: "vendor-acme", label: "Acme" }],
      onClose: vi.fn(),
      onUseExisting,
      onCreated: vi.fn(),
    }),
  );
  await click(button("Use existing Acme", document.body));
  expect(onUseExisting).toHaveBeenCalledWith("vendor-acme");
});

it("sends each mini-form's required payload and idempotency key", async () => {
  const cases = [
    {
      kind: "ingredient" as const,
      hook: "useCreateIngredient",
      expected: { name: "Flour", unit: "pound", costPerUnit: 2.5 },
      fill: (sheet: ParentNode) => {
        change(field("unit", sheet), "pound");
        input("costPerUnit", "2.5", sheet);
      },
    },
    {
      kind: "vendor" as const,
      hook: "useCreateVendor",
      expected: { name: "Supplier" },
      fill: () => undefined,
    },
    {
      kind: "venue" as const,
      hook: "useCreateVenue",
      expected: { name: "Hall", venueType: "other", capacity: 42 },
      fill: (sheet: ParentNode) => input("capacity", "42", sheet),
    },
  ];
  for (const scenario of cases) {
    const create = command(scenario.hook, { docId: `${scenario.kind}-new` });
    await mount(
      createElement(InlineReferenceCreateSheet, {
        kind: scenario.kind,
        open: true,
        initialName: scenario.expected.name,
        existingOptions: [],
        onClose: vi.fn(),
        onUseExisting: vi.fn(),
        onCreated: vi.fn(),
      }),
    );
    scenario.fill(document.body);
    await submit(document.body.querySelector("form")!);
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ...scenario.expected,
        idempotencyKey: expect.any(String),
      }),
    );
  }
});

it("fails closed for missing or unauthorised roles for every reference kind", () => {
  for (const kind of ["client", "ingredient", "vendor", "venue"] as const) {
    expect(canCreateInlineReference(kind, undefined)).toBe(false);
    expect(
      canCreateInlineReference(kind, { role: "event_staff" } as never),
    ).toBe(kind === "venue" ? false : false);
  }
});

it("hides creation and refuses an opened sheet for every unauthorised kind", async () => {
  backend.values.set("authStatus:getAuthStatus", {
    authenticated: true,
    role: "event_staff",
    disabledCapabilities: [],
  });
  for (const kind of ["client", "ingredient", "vendor", "venue"] as const) {
    await mount(
      createElement(InlineReferenceCreateSheet, {
        kind,
        open: true,
        initialName: "Blocked",
        existingOptions: [],
        onClose: vi.fn(),
        onUseExisting: vi.fn(),
        onCreated: vi.fn(),
      }),
    );
    expect(
      document.body.querySelector('[role="alert"]')?.textContent,
    ).toContain("don't have permission");
    expect(document.body.textContent).not.toContain("Create and select");
    expect(button("Close", document.body)).toBeTruthy();
  }
});

it("reports a thrown or empty create result without selecting a record", async () => {
  const onCreated = vi.fn();
  const createVendor = command("useCreateVendor");
  createVendor.mockRejectedValueOnce(new Error("Network unavailable"));
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "vendor",
      open: true,
      initialName: "Supplier",
      existingOptions: [],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated,
    }),
  );
  await submit(document.body.querySelector("form")!);
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
    "Network unavailable",
  );
  expect(onCreated).not.toHaveBeenCalled();

  createVendor.mockResolvedValueOnce({});
  await submit(document.body.querySelector("form")!);
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not create this vendor",
  );
  expect(onCreated).not.toHaveBeenCalled();
});

it("prevents a second submit while a create is pending", async () => {
  let resolve!: (value: { docId: string }) => void;
  const createVendor = command("useCreateVendor");
  createVendor.mockImplementation(
    () => new Promise<{ docId: string }>((done) => (resolve = done)),
  );
  await mount(
    createElement(InlineReferenceCreateSheet, {
      kind: "vendor",
      open: true,
      initialName: "Supplier",
      existingOptions: [],
      onClose: vi.fn(),
      onUseExisting: vi.fn(),
      onCreated: vi.fn(),
    }),
  );
  const form = document.body.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(createVendor).toHaveBeenCalledTimes(1);
  expect(button("Creating.", document.body).disabled).toBe(true);
  await act(async () => resolve({ docId: "vendor-new" }));
});
