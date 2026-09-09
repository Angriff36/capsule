import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, vi } from "vitest";

/** Only service boundaries are doubled. Screens, forms and domain helpers stay real. */
const backend = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  calls: new Map<string, ReturnType<typeof vi.fn>>(),
  reads: vi.fn(),
  authenticated: true,
  organization: { id: "tenant-a", name: "Test Catering", publicMetadata: {} },
  user: {
    id: "user-a",
    firstName: "Ada",
    lastName: "Cook",
    fullName: "Ada Cook",
  },
  session: { id: "session-a", getToken: vi.fn() },
  setActive: vi.fn(async (): Promise<void> => undefined),
  memberships: [] as unknown[],
  clerk: { signOut: vi.fn(async () => undefined) },
}));
export { backend };
vi.mock("../../src/lib/manifest-convex-react", () => {
  const empty: unknown[] = [];
  return new Proxy(
    {},
    {
      has: () => true,
      get(_target, name) {
        if (typeof name !== "string" || name === "then" || name === "default")
          return undefined;
        if (name.startsWith("useList"))
          return () => backend.values.get(name) ?? empty;
        if (name.startsWith("useGet"))
          return (id: string) => {
            backend.reads(name, id);
            return id === "skip" ? undefined : backend.values.get(name);
          };
        if (!backend.calls.has(name))
          backend.calls.set(
            name,
            vi.fn(async () => {
              throw new Error(`Unconfigured command: ${name}`);
            }),
          );
        return () => backend.calls.get(name);
      },
    },
  );
});
vi.mock("convex/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  const command = (reference: Parameters<typeof getFunctionName>[0]) => {
    const key = getFunctionName(reference);
    if (!backend.calls.has(key))
      backend.calls.set(
        key,
        vi.fn(async () => {
          throw new Error(`Unconfigured command: ${key}`);
        }),
      );
    return backend.calls.get(key);
  };
  return {
    ...original,
    useQuery: (
      reference: Parameters<typeof getFunctionName>[0],
      args?: unknown,
    ) => {
      const name = getFunctionName(reference);
      backend.reads(name, args);
      return args === "skip" ? undefined : backend.values.get(name);
    },
    useMutation: command,
    useAction: command,
    useConvexAuth: () => ({
      isAuthenticated: backend.authenticated,
      isLoading: false,
    }),
    Authenticated: ({ children }: { children: ReactNode }) =>
      backend.authenticated ? children : null,
    Unauthenticated: ({ children }: { children: ReactNode }) =>
      backend.authenticated ? null : children,
    AuthLoading: () => null,
    AuthRefreshing: () => null,
  };
});
vi.mock("@clerk/react", () => ({
  useUser: () => ({
    user: backend.user,
    isLoaded: true,
    isSignedIn: backend.authenticated,
  }),
  useOrganization: () => ({
    organization: backend.organization,
    isLoaded: true,
  }),
  useSession: () => ({
    session: backend.session,
    isLoaded: true,
    isSignedIn: backend.authenticated,
  }),
  useOrganizationList: () => ({
    isLoaded: true,
    setActive: backend.setActive,
    userMemberships: { data: backend.memberships },
  }),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: backend.authenticated,
    getToken: backend.session.getToken,
  }),
  useClerk: () => backend.clerk,
  OrganizationSwitcher: () => null,
  UserButton: () => null,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
let root: Root | undefined;
export let container: HTMLDivElement;
export let location = "";
function Location() {
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  backend.values.clear();
  backend.reads.mockClear();
  for (const call of backend.calls.values())
    call.mockReset().mockRejectedValue(new Error("Unconfigured command"));
  backend.authenticated = true;
  backend.memberships = [];
  backend.organization.id = "tenant-a";
  backend.setActive.mockReset().mockResolvedValue(undefined);
  backend.session.getToken.mockReset();
  backend.values.set("authStatus:getAuthStatus", {
    authenticated: true,
    accountId: "user-a",
    personId: "person-a",
    tenantId: "tenant-a",
    role: "owner",
    hasRole: true,
    hasTenant: true,
  });
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
export async function mount(node: ReactNode, path = "/") {
  root ??= createRoot(container);
  await act(async () =>
    root!.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        node,
        createElement(Location),
      ),
    ),
  );
}
export function command(
  name: string,
  result: unknown = { docId: "created-record" },
) {
  const call = backend.calls.get(name) ?? vi.fn();
  call.mockResolvedValue(result);
  backend.calls.set(name, call);
  return call;
}
export function field(name: string, scope: ParentNode = container) {
  const element = scope.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(`[name="${name}"]`);
  expect(element, `Missing form field ${name}`).not.toBeNull();
  return element!;
}
export function input(
  name: string,
  value: string,
  scope: ParentNode = container,
) {
  const element = field(name, scope);
  change(element, value);
}
export function change(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      element instanceof HTMLSelectElement
        ? new Event("change", { bubbles: true })
        : new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value,
          }),
    );
  });
}
export function button(text: string, scope: ParentNode = container) {
  const matches = [
    ...scope.querySelectorAll<HTMLButtonElement>("button"),
  ].filter(
    (node) =>
      node.textContent?.trim() === text ||
      node.getAttribute("aria-label") === text,
  );
  expect(matches, `Expected one button: ${text}`).toHaveLength(1);
  return matches[0]!;
}
export async function click(element: HTMLElement) {
  await act(async () => element.click());
}
export async function submit(form: HTMLFormElement) {
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}
