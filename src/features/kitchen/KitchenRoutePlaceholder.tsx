import { PageHeader } from "../../ui/primitives";

export function KitchenRoutePlaceholder() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Kitchen"
        lead="Shell route is live — recipe book follows the Events slice."
      />
      <div className="card max-w-130 px-4 py-4">
        <p className="leading-relaxed text-ink-2">
          The CapsuleX shell includes Kitchen in the primary rail. Recipe screens
          recreate after Events list and detail are proven.
        </p>
      </div>
    </div>
  );
}
