import { Link } from "react-router-dom";
import { CalendarIcon, PlusIcon } from "../../ui/icons";
import { PageHeader } from "../../ui/primitives";

/** Shell landing — full operations journal arrives with the events slice. */
export function HomePage() {
  return (
    <div className="space-y-8">
      <header className="journal-masthead">
        <div>
          <p className="eyebrow">Capsule operations</p>
          <h1 className="display-title editorial-underline">
            The service desk
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-6 text-ink-2">
            Navigate the workspace from the rail. Events, kitchen, and planned
            areas share one shell, theme, and command palette.
          </p>
        </div>
        <Link to="/events" className="btn btn-primary h-10 px-4">
          <PlusIcon /> Open events
        </Link>
      </header>

      <PageHeader
        title="Primary workspaces"
        lead="Available now in the CapsuleX shell."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/events"
          className="card group px-4 py-4 transition-colors hover:border-brand/40"
        >
          <CalendarIcon className="text-brand" width={20} height={20} />
          <p className="mt-3 font-medium">Events</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            List and detail are wired to generated CapsuleX queries and stage
            mutations.
          </p>
        </Link>
        <Link
          to="/kitchen"
          className="card group px-4 py-4 transition-colors hover:border-brand/40"
        >
          <p className="font-medium">Kitchen</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Recipe book follows the Events slice validation.
          </p>
        </Link>
        <div className="card px-4 py-4">
          <p className="font-medium">Command palette</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Press <span className="kbd">Ctrl</span>{" "}
            <span className="kbd">K</span> to jump across areas.
          </p>
        </div>
      </div>
    </div>
  );
}
