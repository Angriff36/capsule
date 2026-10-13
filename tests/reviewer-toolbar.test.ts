// @vitest-environment jsdom
// The Vercel Toolbar (Comments) mounts on the live site for owners and admins
// only (src/app/shell/ReviewerToolbar.tsx); other staff never load it.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const status = vi.hoisted(() => ({ role: "staff" as string | undefined }));
const mount = vi.hoisted(() => vi.fn(() => () => undefined));

vi.mock("../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => (status.role ? { role: status.role } : undefined),
}));
vi.mock("@vercel/toolbar/vite", () => ({ mountVercelToolbar: mount }));

import { ReviewerToolbar } from "../src/app/shell/ReviewerToolbar";

let host: HTMLDivElement;
let root: Root;

async function renderAs(role: string | undefined) {
  status.role = role;
  await act(async () => {
    root.render(createElement(ReviewerToolbar));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("PROD", true);
  mount.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllEnvs();
});

describe("reviewer toolbar", () => {
  it("mounts for an owner", async () => {
    await renderAs("owner");
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("mounts for an admin", async () => {
    await renderAs("admin");
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("never mounts for other staff or before sign-in finishes", async () => {
    await renderAs("staff");
    await renderAs("kitchen_staff");
    await renderAs(undefined);
    expect(mount).not.toHaveBeenCalled();
  });

  it("never mounts outside a production build", async () => {
    vi.stubEnv("PROD", false);
    await renderAs("owner");
    expect(mount).not.toHaveBeenCalled();
  });
});
