// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  link: vi.fn(),
  user: { id: "user-a", fullName: "Angriff" },
  people: [] as any[],
  auth: undefined as any,
  mutation: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useAction: () => state.link,
  useQuery: () => [],
}));
vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: state.user, isLoaded: true }),
}));
vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => state.auth,
}));
vi.mock(
  "../src/lib/manifest-convex-react",
  () =>
    new Proxy(
      {},
      {
        has: (_target, name) => String(name).startsWith("use"),
        get: (_target, name) => {
          if (name === "then") return undefined;
          if (name === "useListPerson") return () => state.people;
          if (String(name).startsWith("useList")) return () => [];
          if (String(name).startsWith("use")) return () => state.mutation;
          return undefined;
        },
      },
    ),
);
import { MyDayProfileLink } from "../src/features/staff/MyDayProfileLink";
import { resolveMyDayAccount } from "../src/features/staff/resolveMyDayAccount";
import { MyDayPage } from "../src/features/staff/MyDayPage";
import {
  enqueueAction,
  loadQueue,
  drainQueue,
  readCache,
} from "../src/features/staff/offlineStore";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let node: HTMLDivElement;
beforeEach(() => {
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
  state.link.mockReset();
  localStorage.clear();
  state.user = { id: "user-a", fullName: "Angriff" };
  state.auth = {
    authenticated: true,
    personId: "ryan",
    tenantId: "tenant-a",
    role: "admin",
  };
  state.people = [ryan];
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});

const ryan = {
  _id: "ryan",
  tenantId: "tenant-a",
  authSubjectId: "user-a",
  givenName: "Ryan",
  familyName: "Ostwind",
  status: "active",
  deletedAt: null,
};
it("opens My Day from the account profile even when the roster page omits it", async () => {
  state.auth.profile = ryan;
  state.people = [];
  await act(async () =>
    root.render(createElement(MemoryRouter, {}, createElement(MyDayPage))),
  );
  expect(node.querySelector("header")?.textContent).toContain(
    "Angriff · Ryan Ostwind",
  );
  expect(node.textContent).not.toContain("Who are you?");
  expect(node.textContent).not.toContain("You’re signed in");
});
it("drops the previous staff identity when the signed-in account switches", async () => {
  await act(async () =>
    root.render(createElement(MemoryRouter, {}, createElement(MyDayPage))),
  );
  state.user = { id: "user-b", fullName: "Other account" };
  await act(async () =>
    root.render(createElement(MemoryRouter, {}, createElement(MyDayPage))),
  );
  expect(node.querySelector("header")?.textContent).not.toContain(
    "Ryan Ostwind",
  );
  expect(node.textContent).toContain("profile is temporarily unavailable");
});
it("retains unowned older offline work unless the user explicitly confirms discarding it", async () => {
  localStorage.setItem("capsule.my-day.queue", JSON.stringify([{ old: true }]));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () =>
    root.render(createElement(MemoryRouter, {}, createElement(MyDayPage))),
  );
  const discard = [...node.querySelectorAll("button")].find(
    (button) => button.textContent === "Discard older actions",
  )!;
  expect(discard).toBeDefined();
  await act(async () => discard.click());
  expect(localStorage.getItem("capsule.my-day.queue")).not.toBeNull();
  confirm.mockReturnValue(true);
  await act(async () => discard.click());
  expect(localStorage.getItem("capsule.my-day.queue")).toBeNull();
  confirm.mockRestore();
});
it("uses the server-selected staff identity without comparing a display nickname", () => {
  expect(
    resolveMyDayAccount(
      [ryan],
      { authenticated: true, personId: "ryan", tenantId: "tenant-a" },
      "user-a",
    ),
  ).toBe(ryan);
});
it("isolates queued writes and cached records by account/workspace and ignores unowned legacy state", async () => {
  enqueueAction(
    { runKey: "clock-in", label: "A shift", args: { personId: "a" } },
    "user-a/tenant-a/person-a",
  );
  expect(loadQueue("user-b/tenant-b/person-b")).toEqual([]);
  expect(loadQueue(null)).toEqual([]);
  const calls: unknown[] = [];
  await drainQueue(
    {
      "clock-in": async (args) => {
        calls.push(args.personId);
      },
    },
    "user-b/tenant-b/person-b",
  );
  expect(calls).toEqual([]);
  expect(loadQueue("user-a/tenant-a/person-a")).toHaveLength(1);
  await drainQueue(
    {
      "clock-in": async (args) => {
        calls.push(args.personId);
      },
    },
    "user-a/tenant-a/person-a",
  );
  expect(calls).toEqual(["a"]);
  localStorage.setItem(
    "capsule.my-day.cache.people",
    JSON.stringify({ data: [ryan], cachedAt: Date.now() }),
  );
  expect(readCache("people", "user-b/tenant-b/person-b")).toBeUndefined();
});
it("stops replaying the old account's queue after the account changes mid-drain", async () => {
  enqueueAction(
    { runKey: "work", label: "first", args: { n: 1 } },
    "account-a",
  );
  enqueueAction(
    { runKey: "work", label: "second", args: { n: 2 } },
    "account-a",
  );
  let sameAccount = true;
  const calls: unknown[] = [];
  await drainQueue(
    {
      work: async (args) => {
        calls.push(args.n);
        sameAccount = false;
      },
    },
    "account-a",
    () => sameAccount,
  );
  expect(calls).toEqual([1]);
  expect(loadQueue("account-a")).toHaveLength(1);
});
it("does not turn a listed or locally remembered person into a staff identity", () => {
  localStorage.setItem("capsule.my-day.personId.user-a", "ryan");
  expect(
    resolveMyDayAccount(
      [ryan],
      { authenticated: true, personId: null, tenantId: "tenant-a" },
      "user-a",
    ),
  ).toBeUndefined();
  expect(
    resolveMyDayAccount(
      [ryan],
      { authenticated: true, personId: "ryan", tenantId: "tenant-b" },
      "user-a",
    ),
  ).toBeUndefined();
  expect(
    resolveMyDayAccount(
      [ryan],
      { authenticated: true, personId: "ryan", tenantId: "tenant-a" },
      "other-user",
    ),
  ).toBeUndefined();
});
it("attempts real linking and explains an absent match without a fake name picker", async () => {
  state.link.mockResolvedValue({ linked: false, reason: "no_match" });
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        {},
        createElement(MyDayProfileLink, {
          hasLinkedProfile: false,
          canManage: true,
        }),
      ),
    ),
  );
  expect(node.textContent).toContain("You’re signed in");
  expect(node.textContent).toContain(
    "Imported staff records do not grant account access",
  );
  expect(node.textContent).not.toContain("Pick your name");
  expect(node.querySelector('a[href="/admin"]')).not.toBeNull();
});
it("lets a transient provider failure be retried without signing out", async () => {
  state.link.mockRejectedValueOnce(new Error("network"));
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        {},
        createElement(MyDayProfileLink, {
          hasLinkedProfile: false,
          canManage: false,
        }),
      ),
    ),
  );
  expect(node.textContent).toContain("could not be checked");
  state.link.mockResolvedValue({ linked: true, reason: "matched" });
  await act(async () => node.querySelector("button")!.click());
  expect(node.textContent).toContain("Your Capsule profile is ready");
  expect(node.querySelector('a[href="/admin"]')).toBeNull();
});
