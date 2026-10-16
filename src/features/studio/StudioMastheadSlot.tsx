import type { ReactNode } from "react";
import { StudioCatalogGate } from "./StudioCatalogGate";
import { studioSlotKey, studioSlotProps } from "./StudioSlot";

/** Marks an existing page heading so it can be swapped, without restyling it. */
export function StudioMastheadSlot({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const slotKey = studioSlotKey("masthead", title);
  return (
    <StudioCatalogGate
      kind="masthead"
      name="PageHeader"
      slotKey={slotKey}
      model={{ title }}
      live
    >
      <div {...studioSlotProps("masthead", "PageHeader", slotKey, true)}>
        {children}
      </div>
    </StudioCatalogGate>
  );
}
