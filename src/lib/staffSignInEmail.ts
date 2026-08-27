export type StaffSignInEmailInput = {
  companyName: string;
  givenName: string;
  email: string;
  signInUrl: string;
  password?: string;
};

export type RenderedStaffSignInEmail = {
  subject: string;
  html: string;
  text: string;
};

const BRAND = "#31574f";
const ACCENT = "#c8783f";
const INK = "#24322d";
const CANVAS = "#dfe8da";
const PANEL = "#fffefa";

export class StaffSignInEmailRenderer {
  render(input: StaffSignInEmailInput): RenderedStaffSignInEmail {
    const company = input.companyName.trim() || "your team";
    const subject = `Your ${company} Capsule sign-in`;
    const first = input.givenName.trim() || "there";
    const passwordLine = input.password
      ? `Email: ${input.email}\nPassword: ${input.password}\n`
      : "";
    const text = [
      `Hi ${first},`,
      "",
      `You've been added to Capsule for ${company}.`,
      "Open the app with this link:",
      input.signInUrl,
      "",
      passwordLine
        ? `You can also sign in at any time with:\n${passwordLine}`
        : "Use this email the next time you open Capsule.",
      "The button link expires in 7 days. Ask your manager to send a new one if you need it.",
    ]
      .filter((line) => line !== undefined)
      .join("\n");

    const passwordHtml = input.password
      ? `<p style="margin:16px 0 0;color:${INK};font-size:15px;line-height:1.6;">
          You can also sign in any time with this email and password:<br />
          <strong>${escapeHtml(input.email)}</strong><br />
          <span style="font-family:Consolas,Monaco,monospace;letter-spacing:0.04em;">${escapeHtml(input.password)}</span>
        </p>`
      : `<p style="margin:16px 0 0;color:${INK};font-size:15px;line-height:1.6;">
          Use this email the next time you open Capsule.
        </p>`;

    const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;background:${CANVAS};color:${INK};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CANVAS};padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${PANEL};border:1px solid #cbd9c6;border-radius:14px;overflow:hidden;">
          <tr><td style="height:6px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:${BRAND};padding:24px 28px;color:#ffffff;">
            <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;">Capsule</p>
            <h1 style="margin:8px 0 0;font-size:26px;line-height:1.15;font-weight:400;">You're on the team</h1>
          </tr>
          <tr><td style="padding:28px;">
            <p style="margin:0;color:${INK};font-size:16px;line-height:1.6;">Hi ${escapeHtml(first)},</p>
            <p style="margin:12px 0 0;color:${INK};font-size:15px;line-height:1.6;">
              You've been added to Capsule for ${escapeHtml(company)}. Open the app with the button below — no extra signup step.
            </p>
            <p style="margin:24px 0 0;">
              <a href="${escapeHtml(input.signInUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Open Capsule</a>
            </p>
            ${passwordHtml}
            <p style="margin:20px 0 0;color:#5f6b65;font-size:13px;line-height:1.5;">
              The button link expires in 7 days. Ask your manager to send a new sign-in if you need another one.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    return { subject, html, text };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
