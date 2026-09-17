// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  button,
  click,
} from "./support/mounted-app";
import { AuthGate } from "../src/app/AuthGate";

const page = () =>
  createElement(
    AuthGate,
    null,
    createElement("main", null, "Protected workspace"),
  );
function unlinked() {
  backend.organization.id = "";
  backend.values.set("authStatus:getAuthStatus", {
    accountId: "user-a",
    authenticated: true,
    hasRole: false,
    hasTenant: false,
  });
}
it("shows the ambiguous-profile recovery and keeps the workspace closed until the server reports a linked membership", async () => {
  unlinked();
  const link = command("authLink:ensureAccountProfile", {
    reason: "ambiguous",
  });
  await mount(page());
  expect(container.textContent).toContain(
    "More than one staff profile uses this email",
  );
  expect(container.querySelector("main")).toBeNull();
  link.mockResolvedValue({ reason: "matched" });
  await click(button("Try again"));
  expect(link).toHaveBeenCalledTimes(2);
  expect(container.querySelector("main")).toBeNull();
  backend.values.set("authStatus:getAuthStatus", {
    accountId: "user-a",
    personId: "person-a",
    authenticated: true,
    role: "staff",
    tenantId: "tenant-a",
    hasRole: true,
    hasTenant: true,
  });
  await mount(page());
  expect(container.querySelector("main")?.textContent).toBe(
    "Protected workspace",
  );
});

it("waits for workspace activation and the matching JWT before retrying profile linkage", async () => {
  vi.useFakeTimers();
  try {
    unlinked();
    const link = command("authLink:ensureAccountProfile", {
      reason: "ambiguous",
    });
    backend.memberships = [
      {
        organization: { id: "tenant-b", name: "Second kitchen" },
        role: "org:member",
      },
    ];
    await mount(page());
    link.mockClear();
    let activate!: () => void;
    backend.setActive.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          activate = resolve;
        }),
    );
    backend.session.getToken
      .mockResolvedValueOnce(
        `fixture.${btoa(JSON.stringify({ tenantId: "tenant-a" }))}.fixture`,
      )
      .mockResolvedValue(
        `fixture.${btoa(JSON.stringify({ tenantId: "tenant-b" }))}.fixture`,
      );
    await click(button("Second kitchen / member"));
    expect(backend.setActive).toHaveBeenCalledExactlyOnceWith({
      organization: "tenant-b",
    });
    expect(backend.session.getToken).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    await act(async () => activate());
    expect(backend.session.getToken).toHaveBeenCalledExactlyOnceWith({
      skipCache: true,
    });
    expect(link).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(40));
    expect(backend.session.getToken).toHaveBeenCalledTimes(2);
    expect(link).toHaveBeenCalledExactlyOnceWith({});
  } finally {
    vi.useRealTimers();
  }
});
