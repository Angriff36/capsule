import { useConvex } from "convex/react";
import { api, type Id } from "./api";

type MenuPicture = {
  dishName: string;
  storageId?: string | null;
  imageUrl?: string | null;
};

/**
 * AC-654: the proposal file's dish pictures, read when the file is made (so
 * the list page does not read every picture up front). A draft reads its
 * pictures live; a sent proposal's frozen pictures get their addresses from
 * the same company-checked read the dish pages use.
 */
export function useProposalPictureUrls() {
  const convex = useConvex();
  return async <T extends { _id: string; menuPictures?: MenuPicture[] }>(
    proposal: T,
  ): Promise<T> => {
    if (proposal.menuPictures == null) {
      const live = await convex
        .query(api.lib.proposalPictures.forProposal, {
          proposalId: proposal._id as Id<"proposals">,
        })
        .catch(() => []);
      return { ...proposal, menuPictures: live };
    }
    const storageIds = proposal.menuPictures.flatMap((picture) =>
      picture.storageId && !picture.imageUrl ? [picture.storageId] : [],
    );
    if (storageIds.length === 0) return proposal;
    const urls = await convex
      .query(api.fileStorage.urlsForStorageIds, { storageIds })
      .catch(() => ({}) as Record<string, string | null>);
    return {
      ...proposal,
      menuPictures: proposal.menuPictures.map((picture) =>
        picture.storageId && !picture.imageUrl
          ? { ...picture, imageUrl: urls[picture.storageId] ?? null }
          : picture,
      ),
    };
  };
}
