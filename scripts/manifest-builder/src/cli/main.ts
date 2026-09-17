import { BUILDER_CLI_HELP } from "./help.ts";
import { runAdoptOwnershipCommand } from "./commands/adoptOwnership.ts";
import { runGenerateConvexCommand } from "./commands/generateConvex.ts";
import { runMigrateManifestSourceCommand } from "./commands/migrateManifestSource.ts";

export async function runBuilderCli(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(BUILDER_CLI_HELP);
    return 0;
  }

  const [command, subcommand, ...rest] = args;
  if (command === "generate" && subcommand === "convex") {
    return runGenerateConvexCommand({ argv: rest });
  }
  if (command === "migrate" && subcommand === "manifest-source") {
    return runMigrateManifestSourceCommand({ argv: rest });
  }
  if (command === "adopt" && subcommand === "ownership") {
    return runAdoptOwnershipCommand({ argv: rest });
  }

  console.error(
    `Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`,
  );
  console.error("");
  console.error(BUILDER_CLI_HELP);
  return 1;
}
