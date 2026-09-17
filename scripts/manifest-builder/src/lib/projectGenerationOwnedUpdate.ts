/**
 * Three-way planning for a single Builder-owned generated file (non-package.json).
 */
import { ProjectGenerationBaselineStore } from "./projectGenerationBaselineStore";
import {
  canReceiveBaselinedFlag,
  ownershipBaselinePolicyMessage,
} from "./projectGenerationOwnershipPolicy";
import { hashContent } from "./projectGenerationPaths";
import {
  classifyOwnedFileThreeWay,
  formatThreeWayConflictMessage,
  recordBaselineBlob,
  resolveBaselineContent,
} from "./projectGenerationThreeWay";
import type {
  OwnedFile,
  ProjectGenerationConflict,
  ProjectGenerationPlan,
  ThreeWayConflictDiagnostics,
} from "./projectGenerationTypes";

function pushBaseline(plan: ProjectGenerationPlan, content: string): string {
  const blobs = new Map(Object.entries(plan.baselineBlobs));
  const digest = recordBaselineBlob(blobs, content);
  plan.baselineBlobs = Object.fromEntries(blobs);
  return digest;
}

export async function planOwnedGeneratedFile(options: {
  path: string;
  previous: OwnedFile;
  currentContent: string;
  desiredContent: string;
  plan: ProjectGenerationPlan;
  baselineStore: ProjectGenerationBaselineStore;
  pushConflict: (
    path: string,
    message: string,
    diagnostics: ThreeWayConflictDiagnostics,
  ) => ProjectGenerationConflict;
}): Promise<void> {
  const {
    path,
    previous,
    currentContent,
    desiredContent,
    plan,
    baselineStore,
  } = options;

  // Adopted author seam: ownership matches disk, stock candidate differs — preserve
  // only when the path is an explicitly declared baselineable author seam.
  if (
    previous.baselined === true &&
    currentContent !== desiredContent &&
    hashContent(currentContent) === previous.sha256
  ) {
    if (canReceiveBaselinedFlag(path)) {
      plan.nextOwnership.files[path] = {
        sha256: previous.sha256,
        baselined: true,
      };
      pushBaseline(plan, currentContent);
      return;
    }
    // Illegal baselined flag on a stock surface — ignore and continue three-way
    // so regen can apply the fresh candidate. Policy is named in diagnostics
    // when a genuine conflict still occurs.
  }

  const baselineContent = await resolveBaselineContent({
    baselineDigest: previous.sha256,
    currentContent,
    readFromStore: (digest) => baselineStore.read(digest),
  });

  const decision = classifyOwnedFileThreeWay({
    path,
    baselineDigest: previous.sha256,
    baselineContent,
    currentContent,
    candidateContent: desiredContent,
  });

  switch (decision.classification) {
    case "no-op": {
      plan.nextOwnership.files[path] =
        previous.baselined === true && canReceiveBaselinedFlag(path)
          ? { sha256: previous.sha256, baselined: true }
          : { sha256: previous.sha256 };
      pushBaseline(plan, currentContent);
      return;
    }
    case "normal-update": {
      plan.writes[path] = desiredContent;
      plan.modifications.push(path);
      plan.nextOwnership.files[path] = { sha256: decision.candidateDigest };
      pushBaseline(plan, desiredContent);
      return;
    }
    case "safe-ledger-repair": {
      // Disk already equals fresh Builder output — repair ownership only.
      plan.ledgerRepairs.push(path);
      plan.nextOwnership.files[path] = { sha256: decision.candidateDigest };
      pushBaseline(plan, desiredContent);
      return;
    }
    case "genuine-conflict": {
      const diagnostics = decision.diagnostics!;
      let message = formatThreeWayConflictMessage(diagnostics);
      if (previous.baselined === true && !canReceiveBaselinedFlag(path)) {
        message = `${message}\n\n${ownershipBaselinePolicyMessage(path)}`;
      }
      plan.conflicts.push(options.pushConflict(path, message, diagnostics));
      return;
    }
    default: {
      const _exhaustive: never = decision.classification;
      throw new Error(
        `Unhandled three-way classification: ${String(_exhaustive)}`,
      );
    }
  }
}
