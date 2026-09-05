import "@fontsource-variable/dm-sans";
import "@fontsource/ibm-plex-mono";
import "./styles/app.css";

import {
  ClerkFailed,
  ClerkLoading,
  ClerkProvider,
  useAuth,
} from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { AuthSetupRequired, isAuthConfigured } from "./app/AuthGate";
import {
  OfflineGate,
  SignInUnreachable,
  SlowSignInNotice,
} from "./app/shell/OfflineShell";
import { checkDeploymentConfig } from "./lib/deploymentConfigCheck";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  string | undefined;

// PR12-01 / AC-028 startup half: redacted, actionable findings when the
// shipped frontend env is wrong (a development Clerk key in production is
// issue #265). Log-only; the render tree below already degrades safely.
const startupConfigFindings = checkDeploymentConfig({
  environment: import.meta.env.MODE,
  viteConvexUrl: convexUrl,
  viteClerkPublishableKey: clerkPublishableKey,
}).findings;
for (const finding of startupConfigFindings) {
  console.error(
    `[capsule config] ${finding.code}: ${finding.message} Fix: ${finding.action}`,
  );
}

// A deploy rewrites every content-hashed chunk, so a tab opened before it
// asks for a lazy route chunk that no longer exists. Vercel's SPA rewrite
// answers with index.html (200, text/html), the module fails to parse, and
// the route dies in the error boundary. Reload once to pick up the new
// index; the timestamp guard stops a reload loop when the chunk is genuinely
// broken rather than merely stale.
const CHUNK_RELOAD_AT = "capsule:chunk-reload-at";
window.addEventListener("vite:preloadError", (event) => {
  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_AT) ?? 0);
  if (Date.now() - lastReload < 10_000) return; // just tried — let it surface
  sessionStorage.setItem(CHUNK_RELOAD_AT, String(Date.now()));
  event.preventDefault(); // suppress the rethrow so we reload instead of crashing
  window.location.reload();
});

// PWA app shell: the worker caches only same-origin static files (see
// public/sw.js). Production builds only — in dev Vite serves unhashed modules
// and HMR, which a cache would fight.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
  // A tapped chat notification asks the open page to move to its thread
  // (public/sw.js falls back to this when it cannot navigate the client).
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type === "capsule:navigate" && typeof data.url === "string") {
      const url = new URL(data.url, window.location.origin);
      if (url.origin === window.location.origin) window.location.assign(url);
    }
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <OfflineGate>
      {!convexUrl ? (
        <AuthSetupRequired />
      ) : isAuthConfigured() && clerkPublishableKey ? (
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <ClerkLoading>
            <SlowSignInNotice />
          </ClerkLoading>
          <ClerkFailed>
            <SignInUnreachable />
          </ClerkFailed>
          <ConvexProviderWithClerk
            client={new ConvexReactClient(convexUrl)}
            useAuth={useAuth}
          >
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConvexProviderWithClerk>
        </ClerkProvider>
      ) : (
        <AuthSetupRequired />
      )}
    </OfflineGate>
  </StrictMode>,
);
