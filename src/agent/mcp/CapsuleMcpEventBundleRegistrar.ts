import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { CapsuleEventBundleCoordinator } from "../CapsuleEventBundleCoordinator";
import type { CapsuleEventBundleContext } from "../CapsuleEventBundleExistingState";
import { CapsuleEventBundleStateLoader } from "../CapsuleEventBundleStateLoader";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import {
  loadEventBundle,
  type EventBundleFile,
} from "../../lib/tppReports/loadEventBundle";
import { CapsuleMcpTextResult } from "./CapsuleMcpTextResult";

/**
 * Registers the TPP event-bundle tools.
 *
 * Files are read from disk by path because the reports are spreadsheets and
 * PDFs, which an agent cannot paste as text. The server runs on the same
 * machine as the files.
 */

const REPORT_FILE = /\.(csv|xlsx|pdf)$/i;

function collectFiles(paths: readonly string[]): EventBundleFile[] {
  const files: EventBundleFile[] = [];
  for (const path of paths) {
    const full = resolve(path);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      for (const name of readdirSync(full)) {
        if (!REPORT_FILE.test(name)) continue;
        files.push({ name, contents: readFileSync(join(full, name)) });
      }
      continue;
    }
    files.push({
      name: full.split(/[\\/]/).at(-1) ?? full,
      contents: readFileSync(full),
    });
  }
  return files;
}

export class CapsuleMcpEventBundleRegistrar {
  private readonly text = new CapsuleMcpTextResult();

  constructor(
    private readonly executor: CapsuleCommandExecutor,
    private readonly stateLoader: CapsuleEventBundleStateLoader = new CapsuleEventBundleStateLoader(),
  ) {}

  private async context(
    eventId: string | undefined,
    readTenant: boolean,
  ): Promise<CapsuleEventBundleContext> {
    const context: CapsuleEventBundleContext = {};
    if (!readTenant && eventId === undefined) return context;
    context.directory = await this.stateLoader.loadDirectory();
    if (eventId !== undefined) {
      context.existing = await this.stateLoader.loadExisting(eventId);
    }
    return context;
  }

  register(server: McpServer): void {
    const paths = z
      .array(z.string())
      .describe(
        "Folder or file paths holding one event's TPP reports: event worksheet, proposal, BEO, production worksheet, pack list, order list, battle board PDF.",
      );
    const eventId = z
      .string()
      .optional()
      .describe(
        "Attach to an event that is already in Capsule. What exists is kept; what the reports add is entered.",
      );

    server.tool(
      "preview_capsule_event_bundle",
      "Read a folder of TPP event reports and report what entering them would create. Writes nothing. Always run this before enter_capsule_event_bundle.",
      { paths, eventId },
      async ({ paths: given, eventId: existingEventId }) => {
        const { bundle, recognized, unrecognized } = loadEventBundle(
          collectFiles(given),
        );
        const preview = new CapsuleEventBundleCoordinator(
          this.executor,
        ).preview(bundle, await this.context(existingEventId, true));

        return this.text.format({
          ok: true,
          mode: "preview",
          recognized,
          unrecognized,
          invoiceNumber: bundle.header.invoiceNumber,
          title: bundle.header.title,
          eventDate: bundle.header.eventDate,
          guestCount: bundle.header.guestCount,
          client: bundle.client.name,
          venue: bundle.venue.name,
          attachesTo: existingEventId,
          wouldCreate: preview.plan.summary,
          commandCount: preview.plan.steps.length,
          safeToEnterWithoutApproval: preview.safeToEnterWithoutApproval,
          warnings: preview.plan.warnings,
        });
      },
    );

    server.tool(
      "enter_capsule_event_bundle",
      "Enter a previewed TPP event bundle through governed commands: venue, client, contacts, event, timeline, dishes with courses, prep tasks, pack list, proposal with priced lines, invoice with deposit and payments, staff assignments, and the order list as vendors, ingredients and vendor orders. Refuses while warnings are unacknowledged. Re-running does not duplicate records.",
      {
        paths,
        eventId,
        acceptWarnings: z
          .boolean()
          .optional()
          .describe(
            "Required true when the preview reported warnings. Confirms a human read them. Default false.",
          ),
      },
      async ({ paths: given, eventId: existingEventId, acceptWarnings }) => {
        const { bundle, recognized } = loadEventBundle(collectFiles(given));
        const result = await new CapsuleEventBundleCoordinator(
          this.executor,
        ).enter({
          bundle,
          acceptWarnings,
          context: await this.context(existingEventId, true),
        });

        return this.text.format({
          ok: true,
          mode: "enter",
          recognized,
          eventId: result.eventId,
          executedSteps: result.executedSteps,
          idempotencyScope: result.idempotencyScope,
          warnings: result.warnings,
        });
      },
    );
  }
}
