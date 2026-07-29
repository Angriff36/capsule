import { clsx } from "@/lib/utils";

/**
 * DashboardGrid Component
 *
 * Responsive grid layout for dashboard widgets.
 * Supports different sizes and responsive breakpoints.
 */

export type DashboardGridSize = "small" | "medium" | "large" | "full";

export interface DashboardGridItem {
  id: string;
  size: DashboardGridSize;
  content: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export interface DashboardGridProps {
  items: DashboardGridItem[];
  className?: string;
}

const SIZE_CLASSES = {
  small: "col-span-1 md:col-span-1 lg:col-span-1",
  medium: "col-span-1 md:col-span-2 lg:col-span-2",
  large: "col-span-1 md:col-span-2 lg:col-span-3",
  full: "col-span-1 md:col-span-3 lg:col-span-4",
} as const;

export function DashboardGrid({ items, className }: DashboardGridProps) {
  return (
    <div
      className={clsx(
        "grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.id} className={SIZE_CLASSES[item.size]}>
          <div className="h-full">
            {(item.title || item.subtitle) && (
              <div className="mb-2">
                {item.title && (
                  <h3 className="text-sm font-semibold text-ink">
                    {item.title}
                  </h3>
                )}
                {item.subtitle && (
                  <p className="text-xs text-ink-3">{item.subtitle}</p>
                )}
              </div>
            )}
            {item.content}
          </div>
        </div>
      ))}
    </div>
  );
}
