import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface EventManifestViolation {
  file: string;
  rule:
    | "approved-event-api-path"
    | "generated-event-writes-only"
    | "generated-lifecycle-metadata";
  detail: string;
}

const EVENT_TABLES = ["clients", "venues", "events", "eventGuests"] as const;
const EVENT_TABLE_PATTERN = EVENT_TABLES.join("|");
function normalized(relativePath: string): string {
  return relativePath.replaceAll("\\", "/");
}

function authoredTypeScriptFiles(root: string, relativeDir: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = normalized(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) return authoredTypeScriptFiles(root, relativePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
}

function violation(
  file: string,
  rule: EventManifestViolation["rule"],
  detail: string,
): EventManifestViolation {
  return { file: normalized(file), rule, detail };
}

function referencesEventDocument(source: string): boolean {
  return new RegExp(
    `(?:v\\.id\\(\\s*["'](?:${EVENT_TABLE_PATTERN})["']|Id<\\s*["'](?:${EVENT_TABLE_PATTERN})["']|ctx\\.db\\.(?:get|query|insert)\\(\\s*["'](?:${EVENT_TABLE_PATTERN})["'])`,
  ).test(source);
}

function inspectFeatureSource(
  relativePath: string,
  source: string,
): EventManifestViolation[] {
  const violations: EventManifestViolation[] = [];
  const isEventGuestPanel = relativePath.endsWith("/EventGuestPanel.tsx");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );

  for (const imported of imports) {
    if (
      /(?:^|\/)convex\/(?:queries|mutations)(?:\.|$|\/)/.test(imported) ||
      /(?:^|\/)convex\/_generated(?:\/|$)/.test(imported)
    ) {
      violations.push(
        violation(
          relativePath,
          "approved-event-api-path",
          `Import ${JSON.stringify(imported)} bypasses generated Event hooks and src/lib/api.ts.`,
        ),
      );
    }
    if (imported === "convex/react" && !isEventGuestPanel) {
      violations.push(
        violation(
          relativePath,
          "approved-event-api-path",
          "Event features must consume generated React hooks; EventGuestPanel alone may call the generated relationship query.",
        ),
      );
    }
  }

  if (
    /\b(?:useMutation|useAction)\s*\(/.test(source) ||
    (/\buseQuery\s*\(/.test(source) && !isEventGuestPanel)
  ) {
    violations.push(
      violation(
        relativePath,
        "approved-event-api-path",
        "Event features must not construct Convex hooks directly; use manifest-convex-react.ts or the approved EventGuest relationship query.",
      ),
    );
  }

  const stage =
    "planning|pending_approval|approved|executing|completed|cancelled|closed_out|pending|confirmed|declined";
  const literalTransition = new RegExp(
    `\\b(?:from|to)\\s*:\\s*["'](?:${stage})["']`,
  );
  const literalTransitionMap = new RegExp(
    `(?:["']?(?:${stage})["']?)\\s*:\\s*\\[\\s*["'](?:${stage})["']`,
  );
  if (literalTransition.test(source) || literalTransitionMap.test(source)) {
    violations.push(
      violation(
        relativePath,
        "generated-lifecycle-metadata",
        "Event lifecycle transitions must come from generated manifest-wiring-bindings metadata.",
      ),
    );
  }

  if (
    relativePath.endsWith("/EventLifecyclePolicy.ts") &&
    (!source.includes('../../generated/manifest-wiring-bindings"') ||
      !source.includes("EventSubmitForApprovalLifecycle") ||
      !source.includes("EventApproveLifecycle"))
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-lifecycle-metadata",
        "EventLifecyclePolicy must consume generated Event transition metadata.",
      ),
    );
  }
  if (
    relativePath.endsWith("/EventGuestPolicy.ts") &&
    (!source.includes('../../generated/manifest-wiring-bindings"') ||
      !source.includes("EventGuestRsvpConfirmLifecycle") ||
      !source.includes("EventGuestRsvpDeclineLifecycle"))
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-lifecycle-metadata",
        "EventGuestPolicy must consume generated EventGuest transition metadata.",
      ),
    );
  }

  return violations;
}

function inspectAuthoredConvexSource(
  relativePath: string,
  source: string,
): EventManifestViolation[] {
  if (relativePath.endsWith("/convex/lib/culinaryPlanning.ts")) return [];

  const violations: EventManifestViolation[] = [];
  const directInsert = new RegExp(
    `ctx\\.db\\.insert\\(\\s*["'](?:${EVENT_TABLE_PATTERN})["']`,
  );
  const untypedWrite = /ctx\.db\.(?:patch|replace|delete)\s*\(/;
  if (
    directInsert.test(source) ||
    (untypedWrite.test(source) && referencesEventDocument(source))
  ) {
    violations.push(
      violation(
        relativePath,
        "generated-event-writes-only",
        "Authored Convex modules must write Client, Venue, Event, and EventGuest through generated commands.",
      ),
    );
  }
  return violations;
}

export function inspectEventSource(
  relativePath: string,
  source: string,
): EventManifestViolation[] {
  const file = `/${normalized(relativePath).replace(/^\/+/, "")}`;
  if (file.includes("/src/features/events/")) {
    return inspectFeatureSource(file, source);
  }
  if (file.includes("/convex/lib/")) {
    return inspectAuthoredConvexSource(file, source);
  }
  return [];
}

export function inspectEventManifestIntegration(
  root = process.cwd(),
): EventManifestViolation[] {
  const files = [
    ...authoredTypeScriptFiles(root, "src/features/events"),
    ...authoredTypeScriptFiles(root, "convex/lib"),
  ];
  return files.flatMap((relativePath) =>
    inspectEventSource(
      `/${relativePath}`,
      readFileSync(path.join(root, relativePath), "utf8"),
    ),
  );
}

if (import.meta.main) {
  const violations = inspectEventManifestIntegration();
  if (violations.length > 0) {
    console.error("Event Manifest integration guard failed:");
    for (const item of violations) {
      console.error(`- ${item.file}: [${item.rule}] ${item.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      "Event Manifest integration guard passed: generated APIs and lifecycle metadata remain authoritative.",
    );
  }
}
