import { useMutation } from "convex/react";
import { api } from "./api";

export function useSavedViewOperations() {
  return {
    create: useMutation(api.lib.savedViewOperations.create),
    setDefault: useMutation(api.lib.savedViewOperations.setDefault),
  };
}
