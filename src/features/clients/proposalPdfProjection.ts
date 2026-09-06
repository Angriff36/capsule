import type { PricingBasis } from "../../lib/pricing";
import type { ProposalPdfRecord } from "./proposalPdf";

type Revision = { snapshot?: string | null } | null | undefined;
export type ProposalPdfSource =
  "revision" | "legacy-missing-snapshot" | "legacy-malformed-snapshot";

export function proposalPdfDownloadNotice(source: ProposalPdfSource): string {
  if (source === "legacy-missing-snapshot") {
    return "Proposal PDF downloaded using current proposal data because this legacy proposal has no published snapshot.";
  }
  if (source === "legacy-malformed-snapshot") {
    return "Proposal PDF downloaded using current proposal data because its published snapshot could not be read.";
  }
  return "Proposal PDF downloaded.";
}

export async function downloadProjectedProposalPdf<T>({
  projection,
  branding,
  download,
  onNotice,
}: {
  projection: ReturnType<typeof projectProposalPdf>;
  branding: T;
  download: (input: {
    proposal: ProposalPdfRecord;
    clientName: string;
    branding: T;
  }) => Promise<unknown>;
  onNotice: (message: string) => void;
}): Promise<void> {
  await download({
    proposal: projection.proposal,
    clientName: projection.clientName,
    branding,
  });
  onNotice(proposalPdfDownloadNotice(projection.source));
}

export function projectProposalPdf(
  live: ProposalPdfRecord,
  liveClientName: string,
  revision: Revision,
): {
  proposal: ProposalPdfRecord;
  clientName: string;
  source: ProposalPdfSource;
} {
  if (!revision?.snapshot) {
    return {
      proposal: live,
      clientName: liveClientName,
      source: "legacy-missing-snapshot",
    };
  }
  try {
    const frozen = JSON.parse(revision.snapshot) as any;
    const proposal = frozen.proposal;
    if (!proposal || typeof proposal.title !== "string") throw new Error();
    return {
      source: "revision",
      clientName:
        typeof frozen.client?.name === "string" ? frozen.client.name : "Client",
      proposal: {
        _id: live._id,
        proposalNumber: proposal.proposalNumber ?? null,
        title: proposal.title,
        eventDate: proposal.eventDate ?? null,
        eventType: proposal.eventType ?? null,
        guestCount: Number(proposal.guestCount ?? 0),
        venueName: proposal.venueName ?? null,
        venueAddress: proposal.venueAddress ?? null,
        subtotal: Number(proposal.subtotal ?? 0),
        taxAmount: Number(proposal.taxAmount ?? 0),
        discountAmount: Number(proposal.discountAmount ?? 0),
        total: Number(proposal.total ?? 0),
        expiresAt: proposal.expiresAt ?? null,
        notes: proposal.notes ?? null,
        terms: proposal.terms ?? null,
        visibleSections: Array.isArray(proposal.visibleSections)
          ? proposal.visibleSections
          : [],
        dishSelections: Array.isArray(frozen.dishSelections)
          ? frozen.dishSelections
          : [],
        pricingLines: (frozen.lineItems ?? []).map((line: any) => ({
          description: line.description,
          pricingBasis: line.pricingBasis as PricingBasis,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          unit: line.unit,
        })),
        enhancements: Array.isArray(frozen.enhancements)
          ? frozen.enhancements
          : [],
        venueLogistics: frozen.venue
          ? {
              loadIn: frozen.venue.loadInInstructions ?? undefined,
              access: frozen.venue.kitchenAccess ?? undefined,
              restrictions: frozen.venue.restrictions ?? undefined,
            }
          : undefined,
        timelineItems: (frozen.timeline ?? []).map((item: any) => ({
          time: new Date(item.startsAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
          activity: item.name,
        })),
      },
    };
  } catch {
    return {
      proposal: live,
      clientName: liveClientName,
      source: "legacy-malformed-snapshot",
    };
  }
}
