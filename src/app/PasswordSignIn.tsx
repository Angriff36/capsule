import { SignIn, useSignIn } from "@clerk/react";
import { useState, type FormEvent } from "react";

/** Password first; invitation tickets and additional factors remain Clerk-owned. */
export function PasswordSignIn() {
  const { signIn } = useSignIn();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"login" | "reset" | "code" | "new-password">(
    "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("__clerk_ticket") || params.has("__clerk_status");
  });
  const check = (result: {
    error: { message: string; longMessage?: string } | null;
  }) => {
    if (result.error)
      throw new Error(result.error.longMessage || result.error.message);
  };
  const finish = async () => {
    if (signIn.status === "complete") {
      check(
        await signIn.finalize({
          navigate: ({ session }) => {
            // A verified credential can create a pending session (for example,
            // an existing account requiring a password change or workspace).
            // Clerk's widget owns completion of those session tasks.
            if (session.currentTask) setProvider(true);
          },
        }),
      );
    } else {
      // MFA, device trust, and any provider-required recovery stay in the
      // provider flow. A successful password is never treated as a session.
      setProvider(true);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (step === "login") {
        check(
          await signIn.password({ identifier: identifier.trim(), password }),
        );
        setPassword("");
        await finish();
      } else if (step === "reset") {
        check(await signIn.create({ identifier: identifier.trim() }));
        check(await signIn.resetPasswordEmailCode.sendCode());
        setStep("code");
      } else if (step === "code") {
        check(
          await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }),
        );
        setCode("");
        setStep("new-password");
      } else {
        check(await signIn.resetPasswordEmailCode.submitPassword({ password }));
        setPassword("");
        await finish();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const back = async () => {
    setBusy(true);
    setError("");
    try {
      check(await signIn.reset());
      setPassword("");
      setCode("");
      setStep("login");
      setProvider(false);
      // Remove a stale widget step without leaving the requested app route.
      if (window.location.hash.startsWith("#/")) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    } catch {
      setError("Could not restart sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  if (provider) {
    return (
      <div className="flex max-w-full flex-col items-center gap-4">
        <SignIn
          withSignUp={false}
          fallbackRedirectUrl={window.location.pathname}
          initialValues={{
            emailAddress: identifier.includes("@") ? identifier : undefined,
            username:
              identifier && !identifier.includes("@") ? identifier : undefined,
          }}
        />
        <button
          type="button"
          className="btn btn-ghost min-h-[44px]"
          disabled={busy}
          onClick={() => void back()}
        >
          Use username and password
        </button>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
  const title =
    step === "login"
      ? "Sign in to Capsule"
      : step === "reset"
        ? "Set or reset your password"
        : step === "code"
          ? "Check your email"
          : "Choose your password";
  return (
    <section
      aria-labelledby="capsule-sign-in-title"
      className="w-full max-w-md border border-line bg-panel p-6 sm:p-8"
    >
      <h1 id="capsule-sign-in-title" className="text-2xl font-bold">
        {title}
      </h1>
      <p className="mt-2 text-base text-ink-2">
        {step === "login"
          ? "Use your username or email and password."
          : step === "reset"
            ? "We will email a code to verify your account so you can choose a password."
            : step === "code"
              ? "Enter the password-reset code we sent to your account email."
              : "Use this password the next time you sign in."}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {(step === "login" || step === "reset") && (
          <label
            className="flex flex-col gap-2 text-base font-semibold"
            htmlFor="capsule-identifier"
          >
            Username or email
            <input
              id="capsule-identifier"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input min-h-[32px] text-base font-normal max-sm:min-h-[44px]"
              disabled={busy}
            />
          </label>
        )}
        {(step === "login" || step === "new-password") && (
          <label
            className="flex flex-col gap-2 text-base font-semibold"
            htmlFor="capsule-password"
          >
            {step === "login" ? "Password" : "New password"}
            <input
              id="capsule-password"
              name="password"
              type="password"
              autoComplete={
                step === "login" ? "current-password" : "new-password"
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input min-h-[32px] text-base font-normal max-sm:min-h-[44px]"
              disabled={busy}
            />
          </label>
        )}
        {step === "code" && (
          <label
            className="flex flex-col gap-2 text-base font-semibold"
            htmlFor="capsule-reset-code"
          >
            Reset code
            <input
              id="capsule-reset-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input min-h-[32px] text-base font-normal max-sm:min-h-[44px]"
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-base text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary min-h-[44px] w-full"
          disabled={busy}
        >
          {busy
            ? "Please wait..."
            : step === "login"
              ? "Sign in"
              : step === "reset"
                ? "Send reset code"
                : step === "code"
                  ? "Verify code"
                  : "Save password and sign in"}
        </button>
      </form>
      <div className="mt-4 flex flex-col items-start gap-2">
        {step === "login" ? (
          <>
            <button
              type="button"
              className="text-link min-h-[44px] text-left"
              disabled={busy}
              onClick={() => {
                setError("");
                setPassword("");
                setStep("reset");
              }}
            >
              Forgot password or need to set one?
            </button>
            <button
              type="button"
              className="text-link min-h-[44px] text-left"
              disabled={busy}
              onClick={() => {
                setPassword("");
                setProvider(true);
              }}
            >
              Other sign-in options
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-link min-h-[44px] text-left"
            disabled={busy}
            onClick={() => void back()}
          >
            Back to sign in
          </button>
        )}
      </div>
    </section>
  );
}
