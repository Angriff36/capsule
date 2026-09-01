import type { ComponentType, SVGProps } from "react";
import {
  BoxIcon,
  CalendarIcon,
  ContactIcon,
  FileTextIcon,
  FlameIcon,
  UsersIcon,
} from "../../ui/icons";
import type { ChatLinkKind } from "./chatLinkTokens";

/**
 * Glyphs the chat surfaces need that `src/ui/icons` does not carry — same
 * 16-unit stroked grammar, kept beside the screens that use them.
 */
function icon(path: React.ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {path}
      </svg>
    );
  };
}

export type ChatIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const PaperclipIcon = icon(
  <path d="m14.3 7.4-6.1 6.1a4 4 0 0 1-5.7-5.7l6.1-6.1a2.7 2.7 0 0 1 3.8 3.8l-6.1 6.1a1.3 1.3 0 0 1-1.9-1.9l5.7-5.6" />,
);

export const LinkIcon = icon(
  <>
    <path d="M6.7 8.7a3.3 3.3 0 0 0 5 .4l2-2a3.3 3.3 0 0 0-4.7-4.7L7.8 3.5" />
    <path d="M9.3 7.3a3.3 3.3 0 0 0-5-.4l-2 2a3.3 3.3 0 0 0 4.7 4.7l1.2-1.2" />
  </>,
);

export const AtSignIcon = icon(
  <>
    <circle cx="8" cy="8" r="2.7" />
    <path d="M10.7 5.3v3.4a2 2 0 0 0 4 0v-.7a6.7 6.7 0 1 0-2.6 5.3" />
  </>,
);

const KIND_ICONS: Record<ChatLinkKind, ChatIcon> = {
  event: CalendarIcon,
  dish: FlameIcon,
  menu: FileTextIcon,
  client: ContactIcon,
  component: BoxIcon,
  ingredient: BoxIcon,
  person: UsersIcon,
};

/** Glyph for a record kind. Unknown kinds (raw search results) read as a document. */
export function chatKindIcon(kind: string): ChatIcon {
  return (
    (KIND_ICONS as Record<string, ChatIcon | undefined>)[kind] ?? FileTextIcon
  );
}
