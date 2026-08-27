/**
 * AUTHOR SEAM — send the hire sign-in email through Resend.
 */

import {
  StaffSignInEmailRenderer,
  type StaffSignInEmailInput,
} from "../../src/lib/staffSignInEmail";

export type StaffSignInMailEnvironment = {
  resendApiKey: string;
  fromEmail: string;
  appOrigin: string;
};

export function readStaffSignInMailEnvironment(): StaffSignInMailEnvironment {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail =
    process.env.CAPSULE_SIGNIN_FROM_EMAIL?.trim() ||
    process.env.INVOICE_REMINDER_FROM_EMAIL?.trim();
  const appOrigin = process.env.CAPSULE_PUBLIC_APP_URL?.trim();
  if (!resendApiKey || !fromEmail || !appOrigin) {
    throw new Error(
      "Staff sign-in email needs RESEND_API_KEY, CAPSULE_PUBLIC_APP_URL, and INVOICE_REMINDER_FROM_EMAIL (or CAPSULE_SIGNIN_FROM_EMAIL) on this deployment.",
    );
  }
  return { resendApiKey, fromEmail, appOrigin };
}

export class StaffSignInMailer {
  constructor(
    private readonly environment: StaffSignInMailEnvironment,
    private readonly renderer: StaffSignInEmailRenderer = new StaffSignInEmailRenderer(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  appOrigin(): string {
    return this.environment.appOrigin;
  }

  async send(input: StaffSignInEmailInput): Promise<void> {
    const email = this.renderer.render(input);
    const from = formatFromAddress(input.companyName, this.environment.fromEmail);
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.environment.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [
          { name: "category", value: "staff_signin" },
          { name: "staff_email", value: input.email },
        ],
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        body?.message || "The sign-in email could not be sent.",
      );
    }
  }
}

function formatFromAddress(companyName: string, configuredFrom: string): string {
  if (configuredFrom.includes("<")) return configuredFrom;
  const safeName = companyName.replace(/[<>\r\n]/gu, "").trim();
  return `${safeName || "Capsule"} <${configuredFrom}>`;
}
