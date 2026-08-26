export type CatalogImageParentType = "dish" | "ingredient";

type UploadDeps = {
  generateUploadUrl: () => Promise<string>;
  createAttachment: (args: {
    parentType: CatalogImageParentType;
    parentId: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    storageId: string;
  }) => Promise<unknown>;
  setPrimaryImage: (args: {
    docId: string;
    version: number;
    storageId: string;
    fileName: string;
  }) => Promise<unknown>;
};

/** POST file bytes to Convex storage, attach metadata, and set the parent primary image. */
export async function uploadCatalogPrimaryImage(
  file: File,
  parentType: CatalogImageParentType,
  parentId: string,
  version: number,
  deps: UploadDeps,
): Promise<void> {
  const uploadUrl = await deps.generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }
  const { storageId } = (await response.json()) as { storageId: string };
  await deps.createAttachment({
    parentType,
    parentId,
    fileName: file.name,
    contentType: file.type || "image/jpeg",
    fileSize: file.size,
    storageId,
  });
  await deps.setPrimaryImage({
    docId: parentId,
    version,
    storageId,
    fileName: file.name,
  });
}
