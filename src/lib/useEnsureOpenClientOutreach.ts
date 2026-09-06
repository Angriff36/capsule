import { useMutation } from "convex/react";
import { api } from "./api";

export function useEnsureOpenClientOutreach() {
  return useMutation(api.lib.clientOutreach.ensureOpen);
}
