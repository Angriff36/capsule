import { SignIn, useSignIn } from "@clerk/react";
import { useState, type FormEvent } from "react";
import {
  type SecondFactorChannel,
  SignInSecondFactor,
} from "./auth/SignInSecondFactor";
import { type SignInStep, signInStepCopy } from "./auth/signInStepCopy";
import {
  bindSignInPersistence,
  prepareSignInPersistence,
} from "./SessionPersistenceBoundary";

/**
 * Password first. New-device and MFA codes complete on this same screen;
 * only invitation tickets and provider-only recovery reach Clerk's widget.
 */
export function PasswordSignIn() {
  const { signIn } = useSignIn();
  const [remember, setRemember] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<SignInStep>("login");
  const [verifyChannel, setVerifyChannel] =
    useState<SecondFactorChannel | null>(null);
  const [newDevice, setNewDevice] = useState(false);
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
            bindSignInPersistence(session.id);
            // A verified credential can create a pending session (for example,
            // an existing account requiring a password change or workspace).
            // Clerk's widget owns completion of those session tasks.
            if (session.currentTask) setProvider(true);
          },
        }),
      );
    } else if (SignInSecondFactor.isPending(signIn.status)) {
      // New-device trust and MFA: send the code and take it on this screen.
      const factor = new SignInSecondFactor(signIn);
      const channel = factor.pick();
      if (!channel) {
        setProvider(true);
        return;
      }
      const isNewDevice = signIn.status === "needs_client_trust";
      check(await factor.send(channel));
      setNewDevice(isNewDevice);
      setVerifyChannel(channel);
      setCode("");
      setStep("verify");
    } else if (signIn.status === "needs_new_password") {
      setStep("new-password");
    } else {
      // Anything else Clerk requires (tickets, provider recovery) stays in
      // the provider flow. A successful password is never treated as a session.
      setProvider(true);
    }
  };
  const resend = async () => {
    if (busy || !verifyChannel) return;
    setBusy(true);
    setError("");
    try {
      check(await new SignInSecondFactor(signIn).send(verifyChannel));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send a new code.",
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (step === "login") {
        prepareSignInPersistence(remember);
        check(
          await signIn.password({ identifier: identifier.trim(), password }),
        );
        setPassword("");
        await finish();
      } else if (step === "verify" && verifyChannel) {
        check(
          await new SignInSecondFactor(signIn).verify(
            verifyChannel,
            code.trim(),
          ),
        );
        setCode("");
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
        prepareSignInPersistence(remember);
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
      setVerifyChannel(null);
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
  const copyContext = { step, verifyChannel, newDevice };
  return (
    <section
      aria-labelledby="capsule-sign-in-title"
      className="w-full max-w-md border border-line bg-panel p-6 sm:p-8"
    >
      <h1 id="capsule-sign-in-title" className="text-2xl font-bold">
        {signInStepCopy.title(copyContext)}
      </h1>
      <p className="mt-2 text-base text-ink-2">
        {signInStepCopy.description(copyContext)}
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
        {(step === "code" || step === "verify") && (
          <label
            className="flex flex-col gap-2 text-base font-semibold"
            htmlFor="capsule-reset-code"
          >
            {step === "code" ? "Reset code" : "Verification code"}
            <input
              id="capsule-reset-code"
              name="code"
              type="text"
              inputMode={verifyChannel === "backup_code" ? "text" : "numeric"}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input min-h-[32px] text-base font-normal max-sm:min-h-[44px]"
              disabled={busy}
            />
          </label>
        )}
        {(step === "login" || step === "new-password") && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base text-ink">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              disabled={busy}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-5 w-5 accent-brand"
            />
            Keep me signed in
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
          {busy ? "Please wait..." : signInStepCopy.submitLabel(copyContext)}
        </button>
      </form>
      <div className="mt-4 flex flex-col items-start gap-2">
        {step === "verify" &&
          verifyChannel &&
          SignInSecondFactor.canResend(verifyChannel) && (
            <button
              type="button"
              className="text-link min-h-[44px] text-left"
              disabled={busy}
              onClick={() => void resend()}
            >
              Send a new code
            </button>
          )}
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
                try {
                  prepareSignInPersistence(remember);
                  setPassword("");
                  setProvider(true);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not save your sign-in preference.",
                  );
                }
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
