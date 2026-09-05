// LLM-as-Judge fixture — non-deterministic backpressure for subjective criteria.
//
// Why this exists: some acceptance criteria (tone, aesthetics, UX polish) resist
// programmatic checks. This gives the build loop a binary pass/fail gate for them,
// the same shape as a test: run it, and iterate until it passes. Reviews are
// non-deterministic — "deterministically bad in an undeterministic world" — and the
// loop provides eventual consistency by re-running until pass.
//
// Discovery, not documentation: Ralph learns the API from llm-review.test.ts and the
// active criteria from review-criteria.md. Keep this file the single source of truth
// for the review mechanism.
//
// Drop-in: zero dependencies (native fetch, Node 18+). Set ANTHROPIC_API_KEY. Swap the
// MODELS map or REVIEW_ENDPOINT to use a different provider — the API/parsing is the
// only provider-specific part.

export interface ReviewResult {
  pass: boolean;
  feedback?: string; // Only present when pass=false — why it failed / how to fix.
}

export type Intelligence = "fast" | "smart";

export interface ReviewConfig {
  criteria: string; // What to evaluate (behavioral, observable).
  artifact: string; // Text content OR screenshot path (.png/.jpg/.jpeg/.webp/.gif).
  intelligence?: Intelligence; // Defaults to 'fast'.
}

// fast: quick + cheap for straightforward judgments. smart: nuanced aesthetic/creative.
// Examples are swappable — the fixture just needs a multimodal (text + vision) model.
const MODELS: Record<Intelligence, string> = {
  fast: "claude-haiku-4-5",
  smart: "claude-opus-4-8",
};

const REVIEW_ENDPOINT = "https://api.anthropic.com/v1/messages";
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Constrains the model to a binary verdict so callers never parse prose.
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    feedback: { type: "string" }, // Concrete reason + fix when pass=false.
  },
  required: ["pass"],
  additionalProperties: false,
} as const;

// --- Pure helpers (testable without a network call) ---------------------------------

/** Artifact type detection is by extension: a known image extension → vision input. */
export function isImagePath(artifact: string): boolean {
  const lower = artifact.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function mediaTypeFor(imagePath: string): string {
  const lower = imagePath.toLowerCase();
  const ext = IMAGE_EXTENSIONS.find((e) => lower.endsWith(e));
  // ponytail: only reached for isImagePath()-true artifacts, so ext is always found.
  return MEDIA_TYPES[ext ?? ".png"];
}

export function pickModel(intelligence: Intelligence = "fast"): string {
  return MODELS[intelligence];
}

/** Normalize the model's JSON verdict into a ReviewResult (feedback only on fail). */
export function parseVerdict(raw: string): ReviewResult {
  const parsed = JSON.parse(raw) as { pass: unknown; feedback?: unknown };
  const pass = parsed.pass === true;
  if (pass) return { pass: true };
  const feedback =
    typeof parsed.feedback === "string" && parsed.feedback.trim().length > 0
      ? parsed.feedback
      : "Did not meet the criteria (no reason given).";
  return { pass: false, feedback };
}

function reviewInstruction(criteria: string): string {
  return (
    `You are a strict reviewer. Evaluate whether the following artifact meets this ` +
    `criterion. Judge only what is observable; do not invent requirements.\n\n` +
    `Criterion: ${criteria}\n\n` +
    `Return pass=true only if the criterion is clearly met. If pass=false, put a ` +
    `concrete, actionable reason in feedback.`
  );
}

// --- Network ------------------------------------------------------------------------

/** Build the user content block(s) for text vs. image artifacts. */
async function buildContent(config: ReviewConfig): Promise<unknown[]> {
  const instruction = reviewInstruction(config.criteria);
  if (!isImagePath(config.artifact)) {
    return [
      { type: "text", text: `${instruction}\n\nArtifact:\n${config.artifact}` },
    ];
  }
  const { readFile } = await import("node:fs/promises");
  const data = (await readFile(config.artifact)).toString("base64");
  return [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaTypeFor(config.artifact),
        data,
      },
    },
    { type: "text", text: instruction },
  ];
}

/**
 * Run a single LLM review. Returns {pass, feedback?}.
 *
 * Non-deterministic by design — the same artifact may pass or fail across runs. Call it
 * as a gate and let the loop iterate until pass, accepting the natural variance.
 */
export async function createReview(
  config: ReviewConfig,
): Promise<ReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — llm-review needs it to run.",
    );
  }

  const response = await fetch(REVIEW_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: pickModel(config.intelligence),
      max_tokens: 1024,
      messages: [{ role: "user", content: await buildContent(config) }],
      output_config: {
        format: { type: "json_schema", schema: VERDICT_SCHEMA },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`llm-review request failed (${response.status}): ${body}`);
  }

  const message = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = message.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("llm-review got no text verdict from the model.");
  return parseVerdict(text);
}

// --- Active-criteria registry (review-criteria.md) ----------------------------------

export interface ActiveCriterion {
  id: string;
  criteria: string;
  artifact?: string; // Optional path/text; omit ("—") when supplied at test time.
  intelligence: Intelligence;
}

/**
 * Parse the active-criteria Markdown table (review-criteria.md) into typed rows so a
 * project's subjective bars live in one place. Reads the first GFM table it finds:
 * columns Id | Criteria | Artifact | Intelligence.
 */
export function parseCriteriaTable(markdown: string): ActiveCriterion[] {
  const rows = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .map((l) =>
      l
        .slice(1, l.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((c) => c.trim()),
    );

  const out: ActiveCriterion[] = [];
  for (const cells of rows) {
    const [id, criteria, artifact, intelligence] = cells;
    if (!id || id.toLowerCase() === "id") continue; // header row
    if (/^-+$/.test(id)) continue; // separator row
    out.push({
      id,
      criteria: criteria ?? "",
      artifact: artifact && artifact !== "—" ? artifact : undefined,
      intelligence: intelligence === "smart" ? "smart" : "fast",
    });
  }
  return out;
}

/** Load the active criteria from review-criteria.md (defaults to the sibling file). */
export async function loadActiveCriteria(
  path = new URL("./review-criteria.md", import.meta.url),
): Promise<ActiveCriterion[]> {
  const { readFile } = await import("node:fs/promises");
  return parseCriteriaTable(await readFile(path, "utf8"));
}
