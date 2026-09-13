import type { useSignIn } from "@clerk/react";

type SignInHandle = ReturnType<typeof useSignIn>["signIn"];
type FactorResult = Promise<{ error: { message: string } | null }>;

/** Second-step verifications Capsule completes on its own screen. */
export type SecondFactorChannel =
  "email_code" | "phone_code" | "totp" | "backup_code";

const CHANNEL_PRIORITY: readonly SecondFactorChannel[] = [
  "totp",
  "email_code",
  "phone_code",
  "backup_code",
];

const NO_ERROR = { error: null };

/**
 * Drives Clerk's second step (new-device trust or MFA) through Capsule's own
 * form so a verified password never bounces the user to the provider widget.
 * Statuses handled: `needs_client_trust`, `needs_second_factor`.
 */
export class SignInSecondFactor {
  constructor(private readonly signIn: SignInHandle) {}

  static isPending(status: SignInHandle["status"]): boolean {
    return status === "needs_client_trust" || status === "needs_second_factor";
  }

  /** The channel Capsule can complete here, or null when only the widget can. */
  pick(): SecondFactorChannel | null {
    const offered = new Set(
      this.signIn.supportedSecondFactors.map((factor) => factor.strategy),
    );
    return CHANNEL_PRIORITY.find((channel) => offered.has(channel)) ?? null;
  }

  /** Sends the code for channels that deliver one; no-op for app/backup codes. */
  send(channel: SecondFactorChannel): FactorResult {
    switch (channel) {
      case "email_code":
        return this.signIn.mfa.sendEmailCode();
      case "phone_code":
        return this.signIn.mfa.sendPhoneCode();
      default:
        return Promise.resolve(NO_ERROR);
    }
  }

  verify(channel: SecondFactorChannel, code: string): FactorResult {
    switch (channel) {
      case "email_code":
        return this.signIn.mfa.verifyEmailCode({ code });
      case "phone_code":
        return this.signIn.mfa.verifyPhoneCode({ code });
      case "totp":
        return this.signIn.mfa.verifyTOTP({ code });
      case "backup_code":
        return this.signIn.mfa.verifyBackupCode({ code });
    }
  }

  static canResend(channel: SecondFactorChannel): boolean {
    return channel === "email_code" || channel === "phone_code";
  }

  static describe(channel: SecondFactorChannel, newDevice: boolean): string {
    switch (channel) {
      case "email_code":
        return newDevice
          ? "This browser is new to us, so we emailed a code to your account address. Enter it to finish signing in."
          : "Enter the code we emailed to your account address.";
      case "phone_code":
        return newDevice
          ? "This browser is new to us, so we texted a code to your phone. Enter it to finish signing in."
          : "Enter the code we texted to your phone.";
      case "totp":
        return "Enter the code from your authenticator app.";
      case "backup_code":
        return "Enter one of your backup codes.";
    }
  }
}
