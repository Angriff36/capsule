import { useClerk, useSession } from "@clerk/react";
import { useEffect, useState, type ReactNode } from "react";

const INTENT = "capsule.sign-in.persistence";
const MODE_PREFIX = "capsule.sign-in.browser-session.";
const COOKIE = "capsule_browser_session";
const marker = () =>
  document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);

/** Only preference markers are stored here; Clerk owns every credential and token. */
export function prepareSignInPersistence(remember: boolean) {
  if (remember) {
    // Remembered sign-in is Clerk's default, including when browser storage is unavailable.
    try {
      sessionStorage.removeItem(INTENT);
    } catch {
      /* No temporary intent to save. */
    }
    return;
  }
  try {
    let value = marker();
    if (!value) {
      value = crypto.randomUUID();
      document.cookie = `${COOKIE}=${value}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }
    if (marker() !== value) throw new Error("Cookie unavailable");
    // Check persistence before sending credentials, so unchecked never silently
    // becomes a remembered login on a browser that refuses preference storage.
    localStorage.setItem(`${MODE_PREFIX}probe`, value);
    localStorage.removeItem(`${MODE_PREFIX}probe`);
    sessionStorage.setItem(INTENT, value);
  } catch {
    throw new Error(
      "This browser cannot save a temporary sign-in. Allow site storage or select Keep me signed in.",
    );
  }
}

function pendingIntent() {
  try {
    return sessionStorage.getItem(INTENT);
  } catch {
    return null;
  }
}

const signOuts = new Map<string, Promise<void>>();

export function bindSignInPersistence(sessionId: string) {
  const intent = pendingIntent();
  if (intent) {
    localStorage.setItem(`${MODE_PREFIX}${sessionId}`, intent);
    sessionStorage.removeItem(INTENT);
  }
}

function sessionCanContinue(sessionId: string) {
  const key = `${MODE_PREFIX}${sessionId}`;
  let expected: string | null;
  try {
    expected = localStorage.getItem(key);
  } catch {
    // Default Clerk sessions need no application preference storage.
    // A pending opt-out must still be bound successfully before proceeding.
    bindSignInPersistence(sessionId);
    return true;
  }
  if (expected) return expected === marker();
  // OAuth, invitations and required session tasks can finish in the provider
  // widget instead of PasswordSignIn.finalize. Bind the choice on that path too.
  bindSignInPersistence(sessionId);
  const bound = localStorage.getItem(key);
  return !bound || bound === marker();
}

/** Resolve opt-out before any protected Capsule screen mounts. */
export function SessionPersistenceBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded, session } = useSession();
  const clerk = useClerk();
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sessionId = session?.id;
  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!isLoaded || !sessionId) {
      setAcceptedId(null);
      return;
    }
    void (async () => {
      if (sessionCanContinue(sessionId)) {
        if (active) setAcceptedId(sessionId);
      } else {
        // Revoke this specific session only; other devices/accounts are untouched.
        let signingOut = signOuts.get(sessionId);
        if (!signingOut) {
          signingOut = clerk.signOut({ sessionId }).then(() => {
            localStorage.removeItem(`${MODE_PREFIX}${sessionId}`);
          });
          signOuts.set(sessionId, signingOut);
          void signingOut.catch(() => signOuts.delete(sessionId));
        }
        await signingOut;
      }
    })().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [isLoaded, sessionId, clerk, attempt]);

  if (!isLoaded || (sessionId && acceptedId !== sessionId)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="max-w-md text-center">
          <p role={failed ? "alert" : "status"} className="text-base text-ink">
            {failed
              ? "Could not finish checking your sign-in. Please try again."
              : "Checking your sign-in..."}
          </p>
          {failed && (
            <button
              type="button"
              className="btn btn-primary mt-4 min-h-[44px]"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  return children;
}
