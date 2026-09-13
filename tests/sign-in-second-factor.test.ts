import { describe, expect, it, vi } from "vitest";
import {
  SignInSecondFactor,
  type SecondFactorChannel,
} from "../src/app/auth/SignInSecondFactor";
import { signInStepCopy } from "../src/app/auth/signInStepCopy";

const ALL_CHANNELS: readonly SecondFactorChannel[] = [
  "email_code",
  "phone_code",
  "totp",
  "backup_code",
];

function handle(strategies: readonly string[]) {
  const mfa = {
    sendEmailCode: vi.fn(async () => ({ error: null })),
    sendPhoneCode: vi.fn(async () => ({ error: null })),
    verifyEmailCode: vi.fn(async () => ({ error: null })),
    verifyPhoneCode: vi.fn(async () => ({ error: null })),
    verifyTOTP: vi.fn(async () => ({ error: null })),
    verifyBackupCode: vi.fn(async () => ({ error: null })),
  };
  const signIn = {
    status: "needs_second_factor",
    supportedSecondFactors: strategies.map((strategy) => ({ strategy })),
    mfa,
  };
  return {
    mfa,
    factor: new SignInSecondFactor(
      signIn as unknown as ConstructorParameters<typeof SignInSecondFactor>[0],
    ),
  };
}

describe("SignInSecondFactor", () => {
  it("is pending only for the two second-step statuses", () => {
    expect(SignInSecondFactor.isPending("needs_client_trust")).toBe(true);
    expect(SignInSecondFactor.isPending("needs_second_factor")).toBe(true);
    expect(SignInSecondFactor.isPending("complete")).toBe(false);
  });

  it("picks the strongest channel Capsule can complete, else null", () => {
    expect(handle(["phone_code", "email_code"]).factor.pick()).toBe(
      "email_code",
    );
    expect(handle(["backup_code", "totp"]).factor.pick()).toBe("totp");
    expect(handle(["phone_code"]).factor.pick()).toBe("phone_code");
    expect(handle(["backup_code"]).factor.pick()).toBe("backup_code");
    expect(handle(["passkey"]).factor.pick()).toBeNull();
  });

  it("sends a code only for delivered channels", async () => {
    const { factor, mfa } = handle(ALL_CHANNELS);
    await factor.send("email_code");
    await factor.send("phone_code");
    expect(mfa.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(mfa.sendPhoneCode).toHaveBeenCalledTimes(1);
    await expect(factor.send("totp")).resolves.toEqual({ error: null });
    await expect(factor.send("backup_code")).resolves.toEqual({ error: null });
  });

  it("verifies each channel through its own Clerk call", async () => {
    const { factor, mfa } = handle(ALL_CHANNELS);
    await factor.verify("email_code", "111111");
    await factor.verify("phone_code", "222222");
    await factor.verify("totp", "333333");
    await factor.verify("backup_code", "444444");
    expect(mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "111111" });
    expect(mfa.verifyPhoneCode).toHaveBeenCalledWith({ code: "222222" });
    expect(mfa.verifyTOTP).toHaveBeenCalledWith({ code: "333333" });
    expect(mfa.verifyBackupCode).toHaveBeenCalledWith({ code: "444444" });
  });

  it("offers resend for delivered codes only", () => {
    expect(SignInSecondFactor.canResend("email_code")).toBe(true);
    expect(SignInSecondFactor.canResend("phone_code")).toBe(true);
    expect(SignInSecondFactor.canResend("totp")).toBe(false);
    expect(SignInSecondFactor.canResend("backup_code")).toBe(false);
  });

  it("describes every channel, with new-device wording for delivered codes", () => {
    expect(SignInSecondFactor.describe("email_code", true)).toContain(
      "new to us",
    );
    expect(SignInSecondFactor.describe("email_code", false)).toBe(
      "Enter the code we emailed to your account address.",
    );
    expect(SignInSecondFactor.describe("phone_code", true)).toContain(
      "texted a code",
    );
    expect(SignInSecondFactor.describe("phone_code", false)).toBe(
      "Enter the code we texted to your phone.",
    );
    expect(SignInSecondFactor.describe("totp", false)).toContain(
      "authenticator app",
    );
    expect(SignInSecondFactor.describe("backup_code", true)).toContain(
      "backup codes",
    );
  });
});

describe("signInStepCopy", () => {
  const steps = ["login", "reset", "code", "verify", "new-password"] as const;

  it("has a title, description and submit label for every step", () => {
    for (const step of steps) {
      const context = { step, verifyChannel: null, newDevice: false };
      expect(signInStepCopy.title(context)).not.toBe("");
      expect(signInStepCopy.description(context)).not.toBe("");
      expect(signInStepCopy.submitLabel(context)).not.toBe("");
    }
    expect(
      signInStepCopy.title({
        step: "login",
        verifyChannel: null,
        newDevice: false,
      }),
    ).toBe("Sign in to Capsule");
    expect(
      signInStepCopy.submitLabel({
        step: "new-password",
        verifyChannel: null,
        newDevice: false,
      }),
    ).toBe("Save password and sign in");
  });

  it("verify step describes the picked channel, else a generic prompt", () => {
    expect(
      signInStepCopy.description({
        step: "verify",
        verifyChannel: "totp",
        newDevice: false,
      }),
    ).toBe(SignInSecondFactor.describe("totp", false));
    expect(
      signInStepCopy.description({
        step: "verify",
        verifyChannel: null,
        newDevice: true,
      }),
    ).toBe("Enter the verification code to finish signing in.");
  });
});
