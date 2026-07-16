import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../ui/primitives";
import { NAV_AREAS } from "./nav";

export function PlannedAreaPage() {
  const { pathname } = useLocation();
  const area = NAV_AREAS.find((a) => a.path === pathname);
  return (
    <div className="space-y-5">
      <PageHeader
        title={area?.label ?? "Planned area"}
        lead="Planned — not yet built."
      />
      <div className="card max-w-130 px-4 py-4">
        <p className="leading-relaxed text-ink-2">{area?.planned}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          CapsuleX ships one proven vertical slice at a time instead of
          scaffolding empty screens. The generated Convex backend already
          contains this area's entities and commands; the workspace UI lands
          here once the Events slice is validated.
        </p>
        <Link to="/events" className="btn btn-ghost btn-sm mt-4">
          Go to Events
        </Link>
      </div>
    </div>
  );
}
