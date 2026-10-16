import type { ReactNode } from "react";
import {
  renderStudioCatalog,
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
  children,
}: {
  kind: StudioCatalogKind;
  name: string;
  slotKey: string;
  model: StudioBlockModel;
  children: ReactNode;
}) {
  const preview = useStudioPreview();
  const studio = useStudio();
  if (preview) return <>{children}</>;
  const componentId = studio
    ? studio.layout.componentId(studio.pagePattern, slotKey, name)
    : name;
  if (componentId === name) return <>{children}</>;
  return (
    <div {...studioSlotProps(kind, name, slotKey)}>
      {renderStudioCatalog(componentId, model, children)}
    </div>
  );
}
