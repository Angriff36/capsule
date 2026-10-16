import {
  renderStudioCatalog,
  studioCatalogEntry,
  type StudioBlockModel,
} from "./StudioCatalog";
import "./StudioCatalogRegister";
import { StudioPreviewMode } from "./StudioPreviewMode";

export function StudioCatalogPreview(props: {
  caption: string;
  componentId: string;
  model: StudioBlockModel;
}) {
  const entry = studioCatalogEntry(props.componentId);
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold tracking-[0.04em] text-ink-3 uppercase">
        {props.caption}
      </p>
      <div className="relative h-28 overflow-hidden rounded-sm border border-line bg-inset">
        <div
          className="origin-top-left p-2"
          style={{ width: "180%", transform: "scale(0.55)" }}
        >
          <StudioPreviewMode>
            {renderStudioCatalog(
              props.componentId,
              props.model,
              <p className="text-sm font-bold text-ink">{props.model.title}</p>,
            )}
          </StudioPreviewMode>
        </div>
      </div>
      <p className="mt-1 truncate text-xs text-ink-2">
        {entry?.label ?? props.componentId}
      </p>
    </div>
  );
}
