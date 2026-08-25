import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  readonly id: string;
  readonly title: string;
  readonly caption?: string;
  readonly seeAllTo: string;
  readonly seeAllLabel?: string;
  readonly children: ReactNode;
};

/** One section of the phone event overview: title, caption, "See all", body. */
export function MobileSectionCard({
  id,
  title,
  caption,
  seeAllTo,
  seeAllLabel = "See all",
  children,
}: Props) {
  const titleId = `mobile-card-${id}-title`;
  return (
    <section
      className="mobile-section-card"
      data-testid={`mobile-card-${id}`}
      aria-labelledby={titleId}
    >
      <header>
        <div className="min-w-0">
          <h2 id={titleId} className="truncate">
            {title}
          </h2>
          {caption ? <p className="text-sm text-ink-3">{caption}</p> : null}
        </div>
        <Link
          to={seeAllTo}
          className="flex min-h-11 shrink-0 items-center px-2 text-base font-semibold text-accent"
        >
          {seeAllLabel} ›
        </Link>
      </header>
      <div>{children}</div>
    </section>
  );
}

export function MobileEmpty({ children }: { readonly children: ReactNode }) {
  return <p className="py-2 text-base text-ink-3">{children}</p>;
}

/** Trailing "+N more" line under a truncated list. */
export function MobileMore({ count }: { readonly count: number }) {
  if (count <= 0) return null;
  return <p className="pt-2 text-sm text-ink-3">+{count} more</p>;
}
