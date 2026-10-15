import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

const KIND_WORDS: Record<string, string> = {
  improvement: "Improvement",
  missing: "Missing feature",
  broken: "Something is broken",
};

/**
 * Turns one screen comment into a GitHub issue labelled `capsule-feedback`
 * (Ryan 2026-10-13: "have it set up to ping you every time feedback is
 * given"). A new issue with that label starts a Claude run. Needs
 * CAPSULE_FEEDBACK_GITHUB_TOKEN (issues read and write on the repo) on this
 * deployment; without it the comment stays in Capsule and this says so.
 */
export const fileIssue = action({
  args: { id: v.id("pageFeedbacks") },
  handler: async (
    ctx,
    { id },
  ): Promise<
    | { issueUrl: string; started: boolean }
    | { skipped: "no-token" | "not-found" }
  > => {
    const auth = await getAuthContext(ctx);
    if (!ADMIN_ROLES.has(String(auth.role))) {
      throw new Error("Only admins can send screen comments.");
    }
    const feedback = await ctx.runQuery(api.queries.getPageFeedback, { id });
    if (!feedback || feedback.deletedAt != null)
      return { skipped: "not-found" };
    const repo =
      process.env.CAPSULE_FEEDBACK_GITHUB_REPO?.trim() || "Angriff36/capsule";
    if (feedback.issueUrl) {
      const issueNumber =
        feedback.issueNumber ?? issueNumberFromUrl(feedback.issueUrl);
      const started = await kickRoutine(repo, issueNumber, feedback.issueUrl);
      return { issueUrl: feedback.issueUrl, started };
    }
    const token = process.env.CAPSULE_FEEDBACK_GITHUB_TOKEN?.trim();
    if (!token) return { skipped: "no-token" };
    const appUrl = process.env.CAPSULE_PUBLIC_APP_URL?.trim().replace(
      /\/$/,
      "",
    );
    const pageLink = appUrl
      ? `${appUrl}${feedback.pagePath}`
      : feedback.pagePath;
    const kind = KIND_WORDS[feedback.kind] ?? feedback.kind;
    const firstLine = feedback.body.split("\n")[0]!.slice(0, 80);
    const body = [
      feedback.body,
      "",
      "---",
      `**Kind:** ${kind}`,
      `**Screen:** ${feedback.pageTitle ? `${feedback.pageTitle} — ` : ""}[${feedback.pagePath}](${pageLink})`,
      feedback.targetLabel ? `**Pointed at:** ${feedback.targetLabel}` : null,
      feedback.targetSelector
        ? `**Element:** \`${feedback.targetSelector}\``
        : null,
      feedback.viewportWidth
        ? `**Screen width:** ${feedback.viewportWidth}px`
        : null,
      `**From:** ${feedback.leftByName ?? "An admin"}`,
      `**Capsule comment id:** ${id}`,
    ]
      .filter((line): line is string => line != null)
      .join("\n");
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "capsule-feedback",
        },
        body: JSON.stringify({
          title: `[${kind}] ${firstLine}`,
          body,
          labels: ["capsule-feedback"],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub did not take the comment (${response.status}). It is saved in Capsule; try sending it again.`,
      );
    }
    const issue = (await response.json()) as {
      number: number;
      html_url: string;
    };
    await ctx.runMutation(api.mutations.PageFeedback_recordIssue, {
      docId: id,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    });
    const started = await kickRoutine(repo, issue.number, issue.html_url);
    return { issueUrl: issue.html_url, started };
  },
});

function issueNumberFromUrl(issueUrl: string): number {
  const match = /\/issues\/(\d+)/.exec(issueUrl);
  return match ? Number(match[1]) : 0;
}

/** GitHub will not start Claude from a new issue, so Capsule pokes the routine. */
async function kickRoutine(
  repo: string,
  issueNumber: number,
  issueUrl: string,
): Promise<boolean> {
  const routineUrl = process.env.CAPSULE_FEEDBACK_ROUTINE_URL?.trim();
  const routineToken = process.env.CAPSULE_FEEDBACK_ROUTINE_TOKEN?.trim();
  if (!routineUrl || !routineToken) return false;
  const started = await fetch(routineUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${routineToken}`,
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: `Screen comment: issue #${issueNumber} in ${repo} (${issueUrl}). Work on this issue.`,
    }),
  }).catch((error: unknown) => error);
  if (!(started instanceof Response) || !started.ok) {
    console.error(
      "Screen-comment routine did not start",
      started instanceof Response ? started.status : started,
    );
    return false;
  }
  return true;
}
