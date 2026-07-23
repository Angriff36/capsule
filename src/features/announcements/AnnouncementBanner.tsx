import { useUser } from "@clerk/react";
import { useMemo } from "react";
import {
  useCreateAnnouncementDismissal,
  useListAnnouncement,
  useListAnnouncementDismissal,
} from "../../lib/manifest-convex-react";
import { XIcon } from "../../ui/icons";

type CategoryStyle = {
  label: string;
  bar: string;
  chip: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  safety: {
    label: "Safety",
    bar: "border-l-danger",
    chip: "border-danger/30 bg-danger-soft text-danger",
  },
  policyUpdate: {
    label: "Policy",
    bar: "border-l-brand",
    chip: "border-brand/30 bg-brand-soft text-brand",
  },
  training: {
    label: "Training",
    bar: "border-l-info",
    chip: "border-info/30 bg-info-soft text-info",
  },
  general: {
    label: "Notice",
    bar: "border-l-ink-3",
    chip: "border-line-2 bg-inset text-ink-2",
  },
};

const categoryStyle = (category: string): CategoryStyle =>
  CATEGORY_STYLES[category] ?? CATEGORY_STYLES.general;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/**
 * Pinned org-wide announcement banners shown to every signed-in member.
 * Active (non-expired) announcements appear until the member dismisses them;
 * dismissal is per-user so a banner stays visible for everyone else.
 */
export function AnnouncementBanner() {
  const { user } = useUser();
  const announcements = useListAnnouncement();
  const dismissals = useListAnnouncementDismissal();
  const createDismissal = useCreateAnnouncementDismissal();

  const visible = useMemo(() => {
    if (!announcements || !dismissals || !user?.id) return [];
    const now = Date.now();
    const dismissed = new Set(
      dismissals
        .filter((d) => d.authSubjectId === user.id)
        .map((d) => String(d.announcementId)),
    );
    return announcements
      .filter(
        (a) =>
          a.deletedAt == null &&
          a.expiresAt != null &&
          a.expiresAt > now &&
          !dismissed.has(String(a._id)),
      )
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [announcements, dismissals, user?.id]);

  if (visible.length === 0) return null;

  const dismiss = (announcementId: string) => {
    void createDismissal({ announcementId: announcementId as never }).catch(
      () => {
        // Repeat dismissals fail the unique key; the banner already hides
        // optimistically via the reactive dismissal list.
      },
    );
  };

  return (
    <div
      className="border-b border-line-2 bg-panel"
      role="region"
      aria-label="Announcements"
    >
      <ul className="mx-auto max-w-[1440px] divide-y divide-line max-xl:px-8 max-md:px-5">
        {visible.map((a) => {
          const style = categoryStyle(String(a.category));
          return (
            <li
              key={a._id}
              className={`flex items-start gap-3 px-4 py-2.5 border-l-4 ${style.bar}`}
              data-testid="announcement-banner"
              data-category={a.category}
            >
              <span
                className={`mt-0.5 shrink-0 rounded-xs border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase ${style.chip}`}
              >
                {style.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold leading-snug text-ink">
                  {a.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                  {a.body}
                </p>
                <p className="mt-0.5 text-[10.5px] text-ink-3">
                  Until {dateFormat.format(a.expiresAt as number)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(String(a._id))}
                className="mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-inset hover:text-ink"
                aria-label={`Dismiss announcement: ${a.title}`}
              >
                <XIcon width={13} height={13} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
