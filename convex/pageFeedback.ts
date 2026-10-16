import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { FeedbackClaudePoke } from "./lib/feedbackClaudePoke";
import { FeedbackGithubSync } from "./lib/feedbackGithubSync";
import type { Id } from "./_generated/dataModel";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);
const WATCH_AFTER_MS = [90_000, 10 * 60_000, 45 * 60_000] as const;

const KIND_WORDS: Record<string, string> = {
  improvement: "Improvement",
  missing: "Missing feature",
  broken: "Something is broken",
};

type IssuedRow = {
  _id: Id<"pageFeedbacks">;
  status: string;
  issueNumber: number | null;
  issueUrl: string | null;
};

/**
 * Turns one screen comment into a GitHub issue labelled `capsule-feedback`
 * (Ryan 2026-10-13: "have it set up to ping you every time feedback is
 * given"). Capsule then comments @claude on the issue so Claude actually
 * starts. Needs CAPSULE_FEEDBACK_GITHUB_TOKEN (issues read and write) on this
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
    const token = process.env.CAPSULE_FEEDBACK_GITHUB_TOKEN?.trim();
    if (feedback.issueUrl) {
      const issueNumber =
        feedback.issueNumber ?? issueNumberFromUrl(feedback.issueUrl);
      const started = await FeedbackClaudePoke.start(
        repo,
        issueNumber,
        feedback.issueUrl,
        token,
      );
      await watchLater(ctx, id);
      return { issueUrl: feedback.issueUrl, started };
    }
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
    const started = await FeedbackClaudePoke.start(
      repo,
      issue.number,
      issue.html_url,
      token,
    );
    await watchLater(ctx, id);
    return { issueUrl: issue.html_url, started };
  },
});

/** Feedback overlay calls this so a finished GitHub ticket shows Done here. */
export const syncFromGithub = action({
  args: {},
  returns: v.object({ resolved: v.number() }),
  handler: async (ctx): Promise<{ resolved: number }> => {
    const auth = await getAuthContext(ctx);
    if (!ADMIN_ROLES.has(String(auth.role))) {
      throw new Error("Only admins can send screen comments.");
    }
    const rows = (await ctx.runQuery(
      api.queries.listPageFeedback,
      {},
    )) as IssuedRow[];
    let resolved = 0;
    for (const row of rows) {
      if (row.status !== "open" || row.issueNumber == null) continue;
      if (await settleIssued(ctx, row)) resolved += 1;
    }
    return { resolved };
  },
});

export const pollIssue = internalAction({
  args: { id: v.id("pageFeedbacks") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.pageFeedback.getIssued, { id });
    if (!row || row.status !== "open" || row.issueNumber == null) return null;
    await settleIssued(ctx, row);
    return null;
  },
});

export const getIssued = internalQuery({
  args: { id: v.id("pageFeedbacks") },
  returns: v.union(
    v.object({
      _id: v.id("pageFeedbacks"),
      status: v.string(),
      issueNumber: v.union(v.number(), v.null()),
      issueUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }): Promise<IssuedRow | null> => {
    const doc = await ctx.db.get(id);
    if (!doc || doc.deletedAt != null) return null;
    return {
      _id: doc._id,
      status: doc.status,
      issueNumber: doc.issueNumber ?? null,
      issueUrl: doc.issueUrl ?? null,
    };
  },
});

export const applyResolved = internalMutation({
  args: { docId: v.id("pageFeedbacks") },
  returns: v.null(),
  handler: async (ctx, { docId }) => {
    const doc = await ctx.db.get(docId);
    if (!doc || doc.deletedAt != null || doc.status !== "open") return null;
    await ctx.db.patch(docId, {
      status: "resolved",
      resolvedAt: Date.now(),
      issueDoneAt: Date.now(),
      version: (doc.version ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function settleIssued(
  ctx: {
    runMutation: (
      fn: typeof internal.pageFeedback.applyResolved,
      args: { docId: Id<"pageFeedbacks"> },
    ) => Promise<null>;
  },
  row: IssuedRow,
): Promise<boolean> {
  const repo =
    process.env.CAPSULE_FEEDBACK_GITHUB_REPO?.trim() || "Angriff36/capsule";
  const token = process.env.CAPSULE_FEEDBACK_GITHUB_TOKEN?.trim();
  if (!token || row.issueNumber == null) return false;
  const issue = await FeedbackGithubSync.readIssue(
    repo,
    row.issueNumber,
    token,
  );
  if (!issue || !FeedbackGithubSync.finished(issue)) return false;
  await ctx.runMutation(internal.pageFeedback.applyResolved, {
    docId: row._id,
  });
  const already = await FeedbackGithubSync.hasResolvedComment(
    repo,
    row.issueNumber,
    token,
  );
  if (!already) {
    await FeedbackGithubSync.postResolved(repo, row.issueNumber, token);
  }
  if (issue.state !== "closed") {
    await FeedbackGithubSync.closeIssue(repo, row.issueNumber, token);
  }
  return true;
}

async function watchLater(
  ctx: {
    scheduler: {
      runAfter: (
        delay: number,
        fn: typeof internal.pageFeedback.pollIssue,
        args: { id: Id<"pageFeedbacks"> },
      ) => Promise<unknown>;
    };
  },
  id: Id<"pageFeedbacks">,
): Promise<void> {
  for (const delay of WATCH_AFTER_MS) {
    await ctx.scheduler.runAfter(delay, internal.pageFeedback.pollIssue, {
      id,
    });
  }
}

function issueNumberFromUrl(issueUrl: string): number {
  const match = /\/issues\/(\d+)/.exec(issueUrl);
  return match ? Number(match[1]) : 0;
}
