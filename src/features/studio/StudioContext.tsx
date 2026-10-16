import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  useCreateScreenCopyOverride,
  useCreateScreenLayoutOverride,
  useListScreenCopyOverride,
  useListScreenLayoutOverride,
  useScreenCopyOverrideChange,
  useScreenCopyOverrideRevert,
  useScreenLayoutOverrideChange,
  useScreenLayoutOverrideRevert,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { StudioCopyManager } from "./StudioCopyManager";
import { StudioEmptyManagers } from "./StudioEmptyManagers";
import { StudioErrorBoundary } from "./StudioErrorBoundary";
import {
  StudioLayoutManager,
  type StudioLayoutRow,
} from "./StudioLayoutManager";
import { StudioRoles } from "./StudioRoles";
import { StudioRoutePattern } from "./StudioRoutePattern";

type StudioContextValue = {
  pagePattern: string;
  canEdit: boolean;
  ready: boolean;
  copy: StudioCopyManager;
  layout: StudioLayoutManager;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  return (
    <StudioSessionProvider>
      <StudioErrorBoundary fallback={children}>
        <StudioProviderLive>{children}</StudioProviderLive>
      </StudioErrorBoundary>
    </StudioSessionProvider>
  );
}

function StudioSessionProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const status = useAuthStatus();
  const pagePattern = StudioRoutePattern.fromPath(location.pathname);
  const canEdit = StudioRoles.canEdit(status?.role);
  const value = useMemo<StudioContextValue>(
    () => ({
      pagePattern,
      canEdit,
      ready: false,
      copy: StudioEmptyManagers.copy(),
      layout: StudioEmptyManagers.layout(),
    }),
    [pagePattern, canEdit],
  );
  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

function StudioProviderLive({ children }: { children: ReactNode }) {
  const session = useStudio();
  const copyRows = useListScreenCopyOverride();
  const layoutRows = useListScreenLayoutOverride();
  const createCopy = useCreateScreenCopyOverride();
  const changeCopy = useScreenCopyOverrideChange();
  const revertCopy = useScreenCopyOverrideRevert();
  const createLayout = useCreateScreenLayoutOverride();
  const changeLayout = useScreenLayoutOverrideChange();
  const revertLayout = useScreenLayoutOverrideRevert();
  const pagePattern = session?.pagePattern ?? "/";
  const canEdit = session?.canEdit ?? false;

  const value = useMemo<StudioContextValue>(
    () => ({
      pagePattern,
      canEdit,
      // Saved edits must be known before anyone saves or restores one.
      ready: copyRows !== undefined && layoutRows !== undefined,
      copy: new StudioCopyManager(
        copyRows ?? [],
        createCopy,
        changeCopy,
        revertCopy,
      ),
      layout: new StudioLayoutManager(
        (layoutRows ?? []) as StudioLayoutRow[],
        createLayout,
        changeLayout,
        revertLayout,
      ),
    }),
    [
      pagePattern,
      canEdit,
      copyRows,
      layoutRows,
      createCopy,
      changeCopy,
      revertCopy,
      createLayout,
      changeLayout,
      revertLayout,
    ],
  );

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio(): StudioContextValue | null {
  return useContext(StudioContext);
}
