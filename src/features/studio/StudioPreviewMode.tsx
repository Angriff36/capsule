import { createContext, useContext, type ReactNode } from "react";

const StudioPreviewContext = createContext(false);

/** Mini catalog previews must not apply live swaps of their own. */
export function StudioPreviewMode({ children }: { children: ReactNode }) {
  return (
    <StudioPreviewContext.Provider value={true}>
      {children}
    </StudioPreviewContext.Provider>
  );
}

export function useStudioPreview(): boolean {
  return useContext(StudioPreviewContext);
}
