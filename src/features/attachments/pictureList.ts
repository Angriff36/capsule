export type PictureRow = {
  _id: string;
  version: number;
  fileName: string;
  contentType: string;
  storageId: string;
  uploadedAt?: number | null;
  url: string | null;
};

export type PictureKind = "picture" | "video";

/** Picture or video by the file's type; any other file is not shown here. */
export function pictureKind(contentType: string): PictureKind | null {
  const type = contentType.trim().toLowerCase();
  if (type.startsWith("image/")) return "picture";
  if (type.startsWith("video/")) return "video";
  return null;
}

/**
 * The pictures and videos kept on one recipe or catalog item, oldest first,
 * without the main picture (it already shows large above the list).
 */
export function morePictures<T extends PictureRow>(
  rows: readonly T[] | undefined,
  mainStorageId: string | null | undefined,
): Array<T & { kind: PictureKind }> {
  const out: Array<T & { kind: PictureKind }> = [];
  for (const row of rows ?? []) {
    const kind = pictureKind(row.contentType);
    if (!kind || row.storageId === mainStorageId) continue;
    out.push({ ...row, kind });
  }
  return out.sort((a, b) => (a.uploadedAt ?? 0) - (b.uploadedAt ?? 0));
}
