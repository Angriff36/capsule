const RESOLVED_MARKER = "Resolved in Capsule.";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "capsule-feedback",
} as const;

export type FeedbackGithubIssue = {
  number: number;
  state: string;
  html_url: string;
  labels: string[];
};

/** GitHub issue closed or labelled claude-done means the screen comment is done. */
export class FeedbackGithubSync {
  static marker(): string {
    return RESOLVED_MARKER;
  }

  static finished(issue: FeedbackGithubIssue): boolean {
    if (issue.state === "closed") return true;
    return issue.labels.includes("claude-done");
  }

  static async readIssue(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<FeedbackGithubIssue | null> {
    if (issueNumber <= 0) return null;
    const response = await github(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      token,
    );
    if (!response) return null;
    return parseIssue(await response.json());
  }

  static async hasResolvedComment(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<boolean> {
    const response = await github(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=100`,
      token,
    );
    if (!response) return false;
    const rows = (await response.json()) as Array<{ body?: string }>;
    return rows.some((row) => (row.body ?? "").includes(RESOLVED_MARKER));
  }

  static async postResolved(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<void> {
    await github(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          body: [
            RESOLVED_MARKER,
            "",
            "This screen comment is done. In Capsule, Feedback now shows **Done**.",
          ].join("\n"),
        }),
      },
    );
  }

  static async closeIssue(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<void> {
    await github(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      },
    );
  }
}

async function github(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  }).catch((error: unknown) => error);
  if (!(response instanceof Response) || !response.ok) {
    console.error(
      "Screen-comment GitHub call failed",
      url,
      response instanceof Response ? response.status : response,
    );
    return null;
  }
  return response;
}

function parseIssue(value: unknown): FeedbackGithubIssue | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as {
    number?: unknown;
    state?: unknown;
    html_url?: unknown;
    labels?: unknown;
  };
  if (typeof row.number !== "number" || typeof row.state !== "string") {
    return null;
  }
  const labels = Array.isArray(row.labels)
    ? row.labels.flatMap((label) => {
        if (typeof label === "string") return [label];
        if (
          label !== null &&
          typeof label === "object" &&
          "name" in label &&
          typeof label.name === "string"
        ) {
          return [label.name];
        }
        return [];
      })
    : [];
  return {
    number: row.number,
    state: row.state,
    html_url: typeof row.html_url === "string" ? row.html_url : "",
    labels,
  };
}
