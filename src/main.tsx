import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono";
import "./styles/app.css";

import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { AuthSetupRequired, isAuthConfigured } from "./app/AuthGate";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    {!convexUrl ? (
      <AuthSetupRequired />
    ) : isAuthConfigured() && clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
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
  </StrictMode>,
);
