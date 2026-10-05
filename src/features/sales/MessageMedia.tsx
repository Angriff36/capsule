interface MediaRef {
  id: string;
  kind: string;
  name?: string;
}

function readMedia(mediaJson: string | null | undefined): MediaRef[] {
  if (!mediaJson) return [];
  try {
    const value: unknown = JSON.parse(mediaJson);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is MediaRef =>
        !!item && typeof item === "object" && typeof item.id === "string",
    );
  } catch {
    return [];
  }
}

/**
 * PL-INBOX (AC-104, AC-112): photos and files that came with a message,
 * named only. Capsule keeps no link to them, so a private attachment is
 * opened at the provider, never through Capsule.
 */
export function MessageMedia({
  mediaJson,
  providerLabel,
}: {
  mediaJson: string | null | undefined;
  providerLabel: string;
}) {
  const media = readMedia(mediaJson);
  if (media.length === 0) return null;
  return (
    <ul className="mt-1 text-2xs text-ink-3" aria-label="Attachments">
      {media.map((m) => (
        <li key={m.id}>
          {m.name ?? "Attachment"} ({m.kind}) — open it in {providerLabel}
        </li>
      ))}
    </ul>
  );
}
