import { useQuery } from "convex/react";
import { api } from "../../lib/api";

type Size = "thumb" | "hero";

type Props = {
  storageId?: string | null;
  alt: string;
  size?: Size;
  className?: string;
};

const SIZE_CLASS: Record<Size, string> = {
  thumb: "h-14 w-14 rounded-xs object-cover",
  hero: "h-48 w-full max-w-xl rounded-xs object-cover",
};

/** Resolves a Convex storage id into an image or empty state. */
export function DishPrimaryImage({
  storageId,
  alt,
  size = "thumb",
  className,
}: Props) {
  const urls = useQuery(
    api.fileStorage.urlsForStorageIds,
    storageId ? { storageIds: [storageId] } : "skip",
  );
  const url = storageId ? urls?.[storageId] : null;

  if (!storageId) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-line bg-inset text-[11px] text-ink-3 ${SIZE_CLASS[size]} ${className ?? ""}`}
        role="img"
        aria-label={`${alt} — no image`}
      >
        No image
      </div>
    );
  }

  if (urls === undefined) {
    return (
      <div
        className={`animate-pulse bg-line/40 ${SIZE_CLASS[size]} ${className ?? ""}`}
        aria-hidden
      />
    );
  }

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center border border-line bg-inset text-[11px] text-ink-3 ${SIZE_CLASS[size]} ${className ?? ""}`}
        role="img"
        aria-label={`${alt} — image unavailable`}
      >
        Unavailable
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={`${SIZE_CLASS[size]} ${className ?? ""}`}
    />
  );
}
