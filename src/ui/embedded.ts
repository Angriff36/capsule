import { createContext, useContext } from "react";

/** True inside a MergedSection: the folded screen drops its own page title and area nav. */
export const EmbeddedContext = createContext(false);

export function useEmbedded(): boolean {
  return useContext(EmbeddedContext);
}
