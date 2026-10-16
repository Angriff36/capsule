const CLAUDE_WAKE = [
  "@claude This is an in-app screen comment from Capsule.",
  "Work it on the `dev` branch. Do not create a new branch.",
  "Change only what this comment asks.",
  "When you finish, reply on this issue with what changed on the screen, then close this issue.",
  "Capsule treats a closed issue as the screen comment being done.",
].join(" ");

/** GitHub does not start Claude from a new issue. @claude on the thread does. */
export class FeedbackClaudePoke {
  static async start(
    repo: string,
    issueNumber: number,
    issueUrl: string,
    token: string | undefined,
  ): Promise<boolean> {
    const mentioned = await this.mention(repo, issueNumber, token);
    const routine = await this.routine(repo, issueNumber, issueUrl);
    return mentioned || routine;
  }

  private static async mention(
    repo: string,
    issueNumber: number,
    token: string | undefined,
  ): Promise<boolean> {
    if (!token || issueNumber <= 0) return false;
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "capsule-feedback",
        },
        body: JSON.stringify({ body: CLAUDE_WAKE }),
      },
    ).catch((error: unknown) => error);
    if (!(response instanceof Response) || !response.ok) {
      console.error(
        "Screen-comment @claude ping failed",
        response instanceof Response ? response.status : response,
      );
      return false;
    }
    return true;
  }

  private static async routine(
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
}
