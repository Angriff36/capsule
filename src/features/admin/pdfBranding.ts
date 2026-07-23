import type { jsPDF } from "jspdf";
import type { TenantBranding } from "./tenantBranding";

export function addPdfLogo(
  doc: jsPDF,
  branding: TenantBranding,
  options: { x: number; y: number; maxWidth: number; maxHeight: number },
): boolean {
  if (!branding.logoDataUrl) return false;
  try {
    const image = doc.getImageProperties(branding.logoDataUrl);
    const scale = Math.min(
      options.maxWidth / image.width,
      options.maxHeight / image.height,
    );
    doc.addImage(
      branding.logoDataUrl,
      options.x,
      options.y,
      image.width * scale,
      image.height * scale,
    );
    return true;
  } catch {
    return false;
  }
}

export function documentAddressLines(branding: TenantBranding): string[] {
  return branding.address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
