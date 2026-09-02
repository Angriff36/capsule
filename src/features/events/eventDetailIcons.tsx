import type { SVGProps } from "react";

/**
 * Glyphs the event detail surfaces need that `src/ui/icons` does not carry —
 * same 16-unit stroked grammar, kept beside the screens that use them so the
 * shared set stays small. No icon dependency.
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

export const UserIcon = icon(
  <>
    <circle cx="8" cy="5.2" r="2.5" />
    <path d="M2.8 13.4c.5-2.6 2.4-4 5.2-4s4.7 1.4 5.2 4" />
  </>,
);

export const TagIcon = icon(
  <>
    <path d="M2.5 7.6V2.5h5.1l6 6-5.1 5.1z" />
    <circle cx="5.2" cy="5.2" r="0.9" />
  </>,
);

export const MapPinIcon = icon(
  <>
    <path d="M8 14.2c2.6-3 4-5.2 4-7a4 4 0 1 0-8 0c0 1.8 1.4 4 4 7z" />
    <circle cx="8" cy="7" r="1.5" />
  </>,
);

export const StarIcon = icon(
  <path d="m8 2 1.8 3.8 4 .6-2.9 2.9.7 4.1L8 11.5l-3.6 1.9.7-4.1L2.2 6.4l4-.6z" />,
);

export const ListIcon = icon(
  <path d="M2.5 4h2v2h-2zM2.5 10h2v2h-2zM6.5 5h7M6.5 11h7" />,
);

export const PhoneIcon = icon(
  <path d="M3 2.8h2.6l1 2.6-1.4 1a7.4 7.4 0 0 0 3.4 3.4l1-1.4 2.6 1V12a1.3 1.3 0 0 1-1.4 1.3A10.6 10.6 0 0 1 1.7 4.2 1.3 1.3 0 0 1 3 2.8z" />,
);

export const BranchIcon = icon(
  <>
    <circle cx="4.5" cy="3.6" r="1.6" />
    <circle cx="4.5" cy="12.4" r="1.6" />
    <circle cx="11.5" cy="6.4" r="1.6" />
    <path d="M4.5 5.2v5.6M9.9 7.5c-.7 1.6-2.3 2.3-5.4 2.3" />
  </>,
);

export const AccessibilityIcon = icon(
  <>
    <circle cx="8" cy="3.2" r="1.3" />
    <path d="M4.4 5.8 8 6.6l3.6-.8M8 6.6v3.1l2.6 3.5M8 9.7l-2.6 3.5" />
  </>,
);

export const PencilIcon = icon(
  <path d="M2.8 13.2h2.6l7-7a1.4 1.4 0 0 0 0-2l-.6-.6a1.4 1.4 0 0 0-2 0l-7 7z" />,
);

export const LockIcon = icon(
  <>
    <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.2" />
    <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
  </>,
);

export const UndoIcon = icon(
  <path d="M2.6 6.4h6.6a3.6 3.6 0 0 1 0 7.2H5.4M2.6 6.4 5.4 3.6M2.6 6.4l2.8 2.8" />,
);

export const RepeatIcon = icon(
  <path d="M3 6.2V5a1.6 1.6 0 0 1 1.6-1.6h7.8M12.4 3.4 10.6 1.6M12.4 3.4l-1.8 1.8M13 9.8V11a1.6 1.6 0 0 1-1.6 1.6H3.6M3.6 12.6l1.8 1.8M3.6 12.6l1.8-1.8" />,
);

export const ImageIcon = icon(
  <>
    <rect x="2.2" y="3" width="11.6" height="10" rx="1.2" />
    <circle cx="6" cy="6.4" r="1.1" />
    <path d="m2.8 11.4 3.1-3 4 3.6" />
  </>,
);

export const MapIcon = icon(
  <path d="m1.8 3.8 4-1.4 4.4 1.4 4-1.4v9.8l-4 1.4-4.4-1.4-4 1.4zM5.8 2.4v10.2M10.2 3.8V14" />,
);

export const HardHatIcon = icon(
  <>
    <path d="M2.2 11.2a5.8 5.8 0 0 1 11.6 0z" />
    <path d="M1.4 11.2h13.2M6.2 5.8V3.4h3.6v2.4" />
  </>,
);

export const PackageIcon = icon(
  <>
    <path d="M2.4 4.8 8 2.2l5.6 2.6v6.4L8 13.8 2.4 11.2z" />
    <path d="M2.4 4.8 8 7.4l5.6-2.6M8 7.4v6.4M5.2 3.5l5.6 2.6" />
  </>,
);

export const TrendingUpIcon = icon(
  <path d="M2 11.4 6 7.2l2.6 2.4L13.6 4.6M10.6 4.6h3v3" />,
);

export const CloudSunIcon = icon(
  <>
    <circle cx="5.6" cy="5.2" r="2" />
    <path d="M5.6 1.4v.9M5.6 8.1V9M2 5.2h.9M8.3 5.2h.9M3.1 2.7l.6.6M7.5 7.1l.6.6M3.1 7.7l.6-.6M7.5 3.3l.6-.6" />
    <path d="M6.6 13.2h5.6a2.2 2.2 0 0 0 .2-4.4 3 3 0 0 0-5.7-.6 2.5 2.5 0 0 0-.1 5z" />
  </>,
);

export const MinusIcon = icon(<path d="M4 8h8" />);

export const MessageIcon = icon(
  <>
    <path d="M2.6 3.2h10.8v7.4H6.4l-3 2.6v-2.6h-.8z" />
    <path d="M5.4 6.1h5.2M5.4 8.3h3.4" />
  </>,
);

export const WindIcon = icon(
  <path d="M2.4 5.6h6.4a1.8 1.8 0 1 0-1.8-1.8M2.4 10.4h8.2a1.8 1.8 0 1 1-1.8 1.8M2.4 8h10.4" />,
);
