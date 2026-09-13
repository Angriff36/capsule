import {
  type SecondFactorChannel,
  SignInSecondFactor,
} from "./SignInSecondFactor";

export type SignInStep = "login" | "reset" | "code" | "new-password" | "verify";

export interface SignInStepContext {
  step: SignInStep;
  verifyChannel: SecondFactorChannel | null;
  newDevice: boolean;
}

/** Wording for each step of Capsule's own sign-in screen. */
export const signInStepCopy = {
  title({ step }: SignInStepContext): string {
    switch (step) {
      case "login":
        return "Sign in to Capsule";
      case "reset":
        return "Set or reset your password";
      case "code":
        return "Check your email";
      case "verify":
        return "Confirm it's you";
      case "new-password":
        return "Choose your password";
    }
  },
  description({ step, verifyChannel, newDevice }: SignInStepContext): string {
    switch (step) {
      case "login":
        return "Use your username or email and password.";
      case "reset":
        return "We will email a code to verify your account so you can choose a password.";
      case "code":
        return "Enter the password-reset code we sent to your account email.";
      case "verify":
        return verifyChannel
          ? SignInSecondFactor.describe(verifyChannel, newDevice)
          : "Enter the verification code to finish signing in.";
      case "new-password":
        return "Use this password the next time you sign in.";
    }
  },
  submitLabel({ step }: SignInStepContext): string {
    switch (step) {
      case "login":
        return "Sign in";
      case "reset":
        return "Send reset code";
      case "code":
        return "Verify code";
      case "verify":
        return "Verify and sign in";
      case "new-password":
        return "Save password and sign in";
    }
  },
};
