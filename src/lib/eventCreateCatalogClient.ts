import { useMutation } from "convex/react";
import { api } from "./api";

export function useEnsureBuiltInServiceStyle() {
  const mutate = useMutation(api.eventCreateCatalog.ensureBuiltInServiceStyle);
  return (args: {
    name: string;
    code: string;
    sortOrder?: number;
    description?: string;
  }) => mutate(args);
}
