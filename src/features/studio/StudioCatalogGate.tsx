import type { ReactNode } from "react";
import {
  renderStudioCatalog,
  studioSwapAllowed,
  type StudioBlockModel,
  type StudioCatalogKind,
} from "./StudioCatalog";
import { useStudio } from "./StudioContext";
import { useStudioPreview } from "./StudioPreviewMode";
import { studioSlotProps } from "./StudioSlot";

export function StudioCatalogGate({
  kind,
  name,
  slotKey,
  model,
  live = false,
  children,
}: {
  kind: StudioCatalogKind;
  name: string;
  slotKey: string;
  model: StudioBlockModel;
  /** The block shows buttons, links or content a catalog stand-in drops. */
  live?: boolean;
  children: ReactNode;
}) {
  const preview = useStudioPreview();
  const studio = useStudio();
  if (preview) return <>{children}</>;
  const componentId = studio
    ? studio.layout.componentId(studio.pagePattern, slotKey, name)
    : name;
  // A saved swap the block cannot take without losing tabs, buttons or live
  // content shows the block as built.
  if (componentId === name || !studioSwapAllowed(kind, name, live, componentId))
    return <>{children}</>;
  return (
    <div {...studioSlotProps(kind, name, slotKey)}>
      {renderStudioCatalog(componentId, model, children)}
    </div>
  );
}
