import { v } from "convex/values";
export const partArgs = {
  id: v.id("tppUploads"),
  sequence: v.number(),
  collection: v.string(),
  storageId: v.id("_storage"),
  checksum: v.string(),
  byteSize: v.number(),
};
