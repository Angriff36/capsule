/**
 * Record links inside a chat message body.
 *
 * A message body is plain text with inline tokens of the form
 * `[[kind:id|Label]]` — e.g. `[[event:jd7abc|Smith Wedding]]` or a mention
 * `[[person:m3q9|Ana Lopez]]`. Tokens travel inside the (encrypted) body, so
 * no extra table is needed; the label is frozen at send time so the message
 * still reads correctly if the record is later renamed or removed.
 */

export type ChatLinkKind =
  "event" | "dish" | "menu" | "client" | "component" | "ingredient" | "person";

export const CHAT_LINK_KINDS: readonly ChatLinkKind[] = [
  "event",
  "dish",
  "menu",
  "client",
  "component",
  "ingredient",
  "person",
];

export type ChatBodyPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "link";
      readonly kind: ChatLinkKind;
      readonly id: string;
      readonly label: string;
    };

const TOKEN = /\[\[([a-z]+):([A-Za-z0-9_-]+)\|([^\]\n]*)\]\]/g;

function isKind(value: string): value is ChatLinkKind {
  return (CHAT_LINK_KINDS as readonly string[]).includes(value);
}

/** Build the stored token for a record link. Pipes and brackets in the label are dropped. */
export function chatLinkToken(
  kind: ChatLinkKind,
  id: string,
  label: string,
): string {
  const safeLabel = label.replace(/[[\]|\n]/g, " ").trim() || kind;
  return `[[${kind}:${id}|${safeLabel}]]`;
}

/** Split a body into text runs and record links, in order. */
export function parseChatBody(body: string): ChatBodyPart[] {
  const parts: ChatBodyPart[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last)
      parts.push({ type: "text", text: body.slice(last, index) });
    const [, kind, id, label] = match;
    if (kind && id && isKind(kind)) {
      parts.push({ type: "link", kind, id, label: label ?? "" });
    } else {
      parts.push({ type: "text", text: match[0] });
    }
    last = index + match[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

/** Where a record link navigates. Matches the routes the search palette uses. */
export function chatLinkPath(kind: ChatLinkKind, id: string): string {
  switch (kind) {
    case "event":
      return `/events/${id}?tab=overview`;
    case "dish":
      return `/kitchen/dishes/${id}`;
    case "menu":
      return `/kitchen/menus/${id}`;
    case "client":
      return `/clients/${id}`;
    case "component":
      return `/kitchen/components/${id}`;
    case "ingredient":
      return `/kitchen/ingredients/${id}`;
    case "person":
      return "/staff/roster";
  }
}

export const CHAT_LINK_KIND_LABELS: Record<ChatLinkKind, string> = {
  event: "Event",
  dish: "Dish",
  menu: "Menu",
  client: "Client",
  component: "Component",
  ingredient: "Ingredient",
  person: "Teammate",
};

/** Person ids mentioned with `@` — stored alongside the message for notifications. */
export function extractMentionedPersonIds(body: string): string[] {
  const ids = new Set<string>();
  for (const part of parseChatBody(body)) {
    if (part.type === "link" && part.kind === "person") ids.add(part.id);
  }
  return [...ids];
}

/** Body with tokens replaced by their labels — for previews and notifications. */
export function chatPreviewText(body: string, maxLength = 80): string {
  const text = parseChatBody(body)
    .map((part) =>
      part.type === "text"
        ? part.text
        : part.kind === "person"
          ? `@${part.label}`
          : `#${part.label}`,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * The composer shows `@Ana Lopez` / `#Smith Wedding` while typing and keeps a
 * display→token map; on send each display string becomes its token. Longest
 * display strings are replaced first so `#Smith Wedding 2` never loses to
 * `#Smith Wedding`.
 */
export function applyPendingLinks(
  draft: string,
  pending: ReadonlyMap<string, string>,
): string {
  let out = draft;
  const displays = [...pending.keys()].sort((a, b) => b.length - a.length);
  for (const display of displays) {
    const token = pending.get(display);
    if (!token) continue;
    out = out.split(display).join(token);
  }
  return out;
}

/** Display string the composer inserts for a chosen record or teammate. */
export function chatLinkDisplay(kind: ChatLinkKind, label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  return kind === "person" ? `@${clean}` : `#${clean}`;
}
