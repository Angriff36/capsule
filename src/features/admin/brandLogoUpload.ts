import { useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "../../lib/api";
import { useGenerateUploadUrl } from "../../lib/fileStorageClient";
import { useOrganizationSetBrandLogo } from "../../lib/manifest-convex-react";

/** Tenant logo stored in Convex (null = none; undefined = loading). */
export function useBrandLogoUrl(): string | null | undefined {
  return useQuery(api.brandLogo.getBrandLogoUrl, {});
}

/**
 * Uploads a logo file to Convex storage and points the tenant record at it
 * through Organization.setBrandLogo, so admins without a Clerk organization
 * keep their upload (#237). `remove` clears the pointer; the replaced blob is
 * released server-side by the OrganizationBrandLogoSet handler.
 */
export function useBrandLogoManager() {
  const generateUploadUrl = useGenerateUploadUrl();
  const setBrandLogo = useOrganizationSetBrandLogo();

  const upload = useCallback(
    async (organizationId: string, file: File) => {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Logo upload failed (${response.status})`);
      }
      const { storageId } = (await response.json()) as { storageId: string };
      await setBrandLogo({ docId: organizationId, storageId });
    },
    [generateUploadUrl, setBrandLogo],
  );

  const remove = useCallback(
    async (organizationId: string) => {
      await setBrandLogo({ docId: organizationId });
    },
    [setBrandLogo],
  );

  return { upload, remove };
}
