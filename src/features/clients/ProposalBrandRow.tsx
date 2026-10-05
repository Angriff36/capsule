/**
 * Co-branded proposal head (Venue Partner Playbook section 06): the company
 * comes first; at a partner venue the venue's logo sits next to it at the
 * same size. A side with no logo shows its name.
 */
export type ProposalBrand = {
  companyName: string | null;
  companyLogoUrl: string | null;
  partnerVenue: {
    name: string;
    logoUrl: string | null;
    color: string | null;
  } | null;
};

function BrandMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return logoUrl ? (
    <img
      className="h-12 w-auto max-w-[9rem] object-contain"
      src={logoUrl}
      alt={name}
    />
  ) : (
    <span className="text-base font-semibold text-ink">{name}</span>
  );
}

export function ProposalBrandRow({ brand }: { brand: ProposalBrand }) {
  const company = brand.companyName;
  const venue = brand.partnerVenue;
  if (!company && !brand.companyLogoUrl && !venue) return null;
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3"
      data-testid="proposal-brand"
    >
      {company || brand.companyLogoUrl ? (
        <BrandMark
          name={company ?? "Your caterer"}
          logoUrl={brand.companyLogoUrl}
        />
      ) : null}
      {venue ? (
        <>
          <span className="text-lg text-ink-3" aria-label="with">
            ×
          </span>
          <BrandMark name={venue.name} logoUrl={venue.logoUrl} />
        </>
      ) : null}
    </div>
  );
}
