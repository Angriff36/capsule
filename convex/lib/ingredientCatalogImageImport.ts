import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { fetchCatalogImage } from "./foodDatabaseImage";

type ApplyCtx = Pick<
  GenericActionCtx<DataModel>,
  "runMutation" | "runQuery" | "storage"
>;

/** Pull a remote lookup image into Convex storage and set the ingredient primary image. */
export async function applyCatalogImageFromUrl(
  ctx: ApplyCtx,
  docId: Id<"ingredients">,
  imageUrl: string,
): Promise<boolean> {
  const fetched = await fetchCatalogImage(imageUrl);
  if (!fetched) return false;

  let doc = await ctx.runQuery(api.queries.getIngredient, { id: docId });
  if (!doc) return false;

  const storageId = await ctx.storage.store(
    new Blob([fetched.bytes], { type: fetched.contentType }),
  );

  await ctx.runMutation(api.mutations.Attachment_createViaAttach, {
    parentType: "ingredient",
    parentId: docId,
    fileName: fetched.fileName,
    contentType: fetched.contentType,
    fileSize: fetched.bytes.byteLength,
    storageId,
  });

  doc = await ctx.runQuery(api.queries.getIngredient, { id: docId });
  if (!doc) return false;

  await ctx.runMutation(api.mutations.Ingredient_setPrimaryImage, {
    docId,
    version: doc.version,
    storageId,
    fileName: fetched.fileName,
  });

  return true;
}
