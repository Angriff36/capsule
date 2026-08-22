/**
 * Preview or enter a whole TPP event export bundle via governed commands.
 *
 *   bun scripts/capsule-enter-event.ts --preview <folder-or-files>
 *   bun scripts/capsule-enter-event.ts <folder-or-files> --accept-warnings
 *   bun scripts/capsule-enter-event.ts <folder-or-files> --event <id> --accept-warnings
 *
 * Reads the TPP reports for one event — event worksheet, proposal, BEO,
 * production worksheet, pack list, order list and the battle board PDF — and
 * enters the event, its timeline, menu, prep tasks and pack list through the
 * same Manifest commands the UI uses. Preview never writes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { CapsuleEventBundleCoordinator } from "../src/agent/CapsuleEventBundleCoordinator";
import type { CapsuleEventBundleContext } from "../src/agent/CapsuleEventBundleExistingState";
import { CapsuleEventBundleStateLoader } from "../src/agent/CapsuleEventBundleStateLoader";
import { ConvexCommandClient } from "../src/agent/ConvexCommandClient";
import {
  loadEventBundle,
  type EventBundleFile,
} from "../src/lib/tppReports/loadEventBundle";

const REPORT_FILE = /\.(csv|xlsx|pdf)$/i;

function usage(): never {
  console.error(`Usage:
  bun scripts/capsule-enter-event.ts --preview <folder | file...>
  bun scripts/capsule-enter-event.ts <folder | file...> --accept-warnings
  bun scripts/capsule-enter-event.ts <folder | file...> --event <id> [--preview] [--accept-warnings]

Preview never writes. It reports what each file was read as, what would be
created, and every warning.

--event <id> attaches the run to an event that is already in Capsule: what
exists is kept, what the reports add (contacts, courses, prep tasks, pack
list, proposal, invoice, payments, staff, purchasing) is entered. Entering,
and a preview with --event, read the tenant's records first.

Entering refuses while any warning is unacknowledged, because a warning means
the reports disagreed or something could not be mapped. Read the warnings,
then re-run with --accept-warnings.

Re-running the same bundle does not duplicate records: every command carries a
deterministic idempotency key built from the TPP invoice number.`);
  process.exit(2);
}

function collectFiles(paths: readonly string[]): EventBundleFile[] {
  const files: EventBundleFile[] = [];
  for (const path of paths) {
    const full = resolve(process.cwd(), path);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      for (const name of readdirSync(full)) {
        if (!REPORT_FILE.test(name)) continue;
        files.push({ name, contents: readFileSync(join(full, name)) });
      }
      continue;
    }
    files.push({
      name: full.split(/[\\/]/).at(-1)!,
      contents: readFileSync(full),
    });
  }
  return files;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((entry) => entry !== "--");
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") usage();

  const preview = args.includes("--preview");
  const acceptWarnings = args.includes("--accept-warnings");
  const eventFlag = args.indexOf("--event");
  const eventId = eventFlag >= 0 ? args[eventFlag + 1] : undefined;
  if (eventFlag >= 0 && (!eventId || eventId.startsWith("--"))) usage();
  const paths = args.filter(
    (entry, index) => !entry.startsWith("--") && index !== eventFlag + 1,
  );
  if (paths.length === 0) usage();

  const files = collectFiles(paths);
  if (files.length === 0) {
    throw new Error("No .csv, .xlsx or .pdf report files were found.");
  }

  const { bundle, recognized, unrecognized } = loadEventBundle(files);
  const coordinator = new CapsuleEventBundleCoordinator(
    new ConvexCommandClient(),
  );
  const context: CapsuleEventBundleContext = {};
  if (!preview || eventId !== undefined) {
    const loader = new CapsuleEventBundleStateLoader();
    context.directory = await loader.loadDirectory();
    if (eventId !== undefined) {
      context.existing = await loader.loadExisting(eventId);
    }
  }

  if (preview) {
    const result = coordinator.preview(bundle, context);
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "preview",
          recognized,
          unrecognized,
          invoiceNumber: bundle.header.invoiceNumber,
          title: bundle.header.title,
          eventDate: bundle.header.eventDate,
          guestCount: bundle.header.guestCount,
          venue: bundle.venue.name,
          client: bundle.client.name,
          attachesTo: eventId,
          wouldCreate: result.plan.summary,
          commandCount: result.plan.steps.length,
          safeToEnterWithoutApproval: result.safeToEnterWithoutApproval,
          warnings: result.plan.warnings,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await coordinator.enter({ bundle, acceptWarnings, context });
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "enter",
        recognized,
        eventId: result.eventId,
        executedSteps: result.executedSteps,
        idempotencyScope: result.idempotencyScope,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});
