import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono";
import "./styles/app.css";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

/**
 * Shell flow mounts Convex + router without Clerk.
 * Authentication / org membership gate is the next product flow.
 */
function Root() {
  if (!convexUrl) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6">
        <div className="card max-w-130 px-6 py-6">
          <p className="text-[13px] font-semibold tracking-[0.14em] uppercase">
            Capsule
          </p>
          <h1 className="mt-5 text-[19px] font-semibold tracking-tight">
            Convex URL required
          </h1>
          <p className="mt-2 leading-relaxed text-ink-2">
            Set <code className="font-mono">VITE_CONVEX_URL</code> in{" "}
            <code className="font-mono">.env.local</code> (from{" "}
            <code className="font-mono">npx convex dev</code>).
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexProvider client={new ConvexReactClient(convexUrl)}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
