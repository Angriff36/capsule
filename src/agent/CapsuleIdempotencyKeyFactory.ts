import { createHash } from "node:crypto";

/**
 * Deterministic idempotency keys for agent document-enter sequences.
 */
export class CapsuleIdempotencyKeyFactory {
  constructor(readonly scope: string) {}

  static fromDocument(sourceText: string): CapsuleIdempotencyKeyFactory {
    const hash = createHash("sha256")
      .update(sourceText)
      .digest("hex")
      .slice(0, 24);
    return new CapsuleIdempotencyKeyFactory(`doc:${hash}`);
  }

  forCapability(capabilityId: string, suffix: string): string {
    return `${this.scope}:${capabilityId}:${suffix}`;
  }
}
