/**
 * Shared types for the Builder control plane over Manifest.
 * IR shape types are re-exported from Manifest; Builder never defines them.
 */

import type { IR as ManifestIR } from "@angriff36/manifest/ir";

export type {
  IR,
  IREntity,
  IRCommand,
  IRPolicy,
  IRProperty,
  IRType,
  IRValue,
  IRExpression,
} from "@angriff36/manifest/ir";

export type {
  EntitySummary,
  EntityDetails,
  CommandSummary,
  CommandDetails,
  IntentMatch,
} from "@angriff36/manifest/agent-sdk";

export type { IRDiffReport } from "@angriff36/manifest/ir-diff";
export type { ResolverHost } from "@angriff36/manifest/module-resolver";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code?: string;
  entity?: string;
  message: string;
  line?: number;
  column?: number;
  path?: string;
}

export interface CompileResult {
  ir: ManifestIR | null;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}
