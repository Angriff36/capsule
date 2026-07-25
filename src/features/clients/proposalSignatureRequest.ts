// Helper functions for proposal signature request workflow

/**
 * Generate the acceptance URL for a signature request.
 * Uses the callbackToken (entity ID) as the URL parameter.
 */
export function generateAcceptanceUrl(callbackToken: string): string {
  const origin = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
  return `${origin}/accept/${callbackToken}`;
}

/**
 * Acceptance URL parameter interface for proposal PDF.
 */
export interface ProposalAcceptanceUrl {
  acceptanceUrl: string;
  signatureRequestId: string;
  expiresAt: number | null;
}

/**
 * Build acceptance URL data for a signature request.
 */
export function buildAcceptanceUrlData(
  signatureRequestId: string,
  callbackToken: string,
  expiresAt: number | null,
): ProposalAcceptanceUrl {
  return {
    acceptanceUrl: generateAcceptanceUrl(callbackToken),
    signatureRequestId,
    expiresAt,
  };
}
