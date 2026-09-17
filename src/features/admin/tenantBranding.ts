import { useOrganization } from "@clerk/react";
import { useMemo } from "react";
import type { Doc } from "../../lib/api";
import { useListOrganization } from "../../lib/manifest-convex-react";
import { useBrandLogoUrl } from "./brandLogoUpload";

export const DEFAULT_BRAND_PRIMARY = "#233E35";
export const DEFAULT_BRAND_ACCENT = "#BE773F";

export interface TenantBranding {
  displayName: string;
  address: string;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  logoDataUrl?: string;
}

type ClerkOrganizationBrand = {
  name?: string | null;
  imageUrl?: string | null;
  hasImage?: boolean;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isValidBrandColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

export function normalizeBrandColor(value: unknown, fallback: string): string {
  const candidate = String(value ?? "").trim();
  return isValidBrandColor(candidate) ? candidate.toUpperCase() : fallback;
}

export function brandColorRgb(hex: string): [number, number, number] {
  const normalized = normalizeBrandColor(hex, DEFAULT_BRAND_PRIMARY);
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

export function resolveTenantBranding(
  record: Doc<"organizations"> | null | undefined,
  clerkOrganization: ClerkOrganizationBrand | null | undefined,
  storedLogoUrl?: string | null,
): TenantBranding {
  const configuredName = String(record?.brandDisplayName ?? "").trim();
  const domainName = String(record?.name ?? "").trim();
  const clerkName = String(clerkOrganization?.name ?? "").trim();
  // The tenant's own upload (Convex storage) wins; the Clerk organization
  // image is only a fallback for tenants that uploaded before #237.
  const logoUrl =
    storedLogoUrl ||
    (clerkOrganization?.hasImage && clerkOrganization.imageUrl
      ? clerkOrganization.imageUrl
      : undefined);

  return {
    displayName:
      configuredName || domainName || clerkName || "Catering company",
    address: String(record?.brandAddress ?? "").trim(),
    primaryColor: normalizeBrandColor(
      record?.brandPrimaryColor,
      DEFAULT_BRAND_PRIMARY,
    ),
    accentColor: normalizeBrandColor(
      record?.brandAccentColor,
      DEFAULT_BRAND_ACCENT,
    ),
    ...(logoUrl ? { logoUrl } : {}),
  };
}

export function useTenantBranding() {
  const organizations = useListOrganization();
  const { organization: clerkOrganization, isLoaded: clerkLoaded } =
    useOrganization();
  const record = useMemo(
    () =>
      organizations?.find(
        (row) => row.deletedAt == null && String(row.status) === "active",
      ) ?? organizations?.find((row) => row.deletedAt == null),
    [organizations],
  );
  const storedLogoUrl = useBrandLogoUrl();
  const branding = useMemo(
    () => resolveTenantBranding(record, clerkOrganization, storedLogoUrl),
    [record, clerkOrganization, storedLogoUrl],
  );

  return {
    branding,
    record,
    clerkOrganization,
    /** True when the logo shown comes from the tenant's own Convex upload. */
    hasStoredLogo: Boolean(storedLogoUrl),
    loading:
      organizations === undefined ||
      !clerkLoaded ||
      storedLogoUrl === undefined,
  };
}

const blobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Logo read failed."));
    reader.readAsDataURL(blob);
  });

/** Resolve the remotely hosted Clerk logo into bytes jsPDF can embed. */
export async function loadTenantBrandingForPdf(
  branding: TenantBranding,
): Promise<TenantBranding> {
  if (!branding.logoUrl) return branding;
  if (branding.logoUrl.startsWith("data:")) {
    return { ...branding, logoDataUrl: branding.logoUrl };
  }
  try {
    const response = await fetch(branding.logoUrl);
    if (!response.ok) return branding;
    return {
      ...branding,
      logoDataUrl: await blobAsDataUrl(await response.blob()),
    };
  } catch {
    // A logo CDN failure should not prevent an operator from producing a document.
    return branding;
  }
}
