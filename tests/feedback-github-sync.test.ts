import { describe, expect, it } from "vitest";
import { FeedbackGithubSync } from "../convex/lib/feedbackGithubSync";

const issue = (
  state: string,
  state_reason: string | null,
  labels: string[] = [],
) => ({ number: 1, state, state_reason, html_url: "", labels });

describe("a screen comment is done only when its issue was finished", () => {
  it("counts a completed close or the claude-done label", () => {
    expect(FeedbackGithubSync.finished(issue("closed", "completed"))).toBe(
      true,
    );
    expect(
      FeedbackGithubSync.finished(issue("open", null, ["claude-done"])),
    ).toBe(true);
  });

  it("leaves duplicate, not-planned and reasonless closes open", () => {
    expect(FeedbackGithubSync.finished(issue("closed", "not_planned"))).toBe(
      false,
    );
    expect(FeedbackGithubSync.finished(issue("closed", "duplicate"))).toBe(
      false,
    );
    expect(FeedbackGithubSync.finished(issue("closed", null))).toBe(false);
    expect(FeedbackGithubSync.finished(issue("open", null))).toBe(false);
  });
});
