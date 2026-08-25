import type { SVGProps } from "react";

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

export const HomeIcon = icon(
  <path d="M2.5 7.5 8 2.5l5.5 5v6h-4v-4h-3v4h-4z" />,
);
export const CalendarIcon = icon(
  <>
    <rect x="2" y="3" width="12" height="11" rx="1" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </>,
);
export const FlameIcon = icon(
  <path d="M8 1.8c.6 2.4 3.8 3.7 3.8 7a3.8 3.8 0 0 1-7.6 0c0-1.5.7-2.3 1.4-3.2.2 1 .6 1.6 1.4 2 0-2.3.2-4.4 1-5.8z" />,
);
export const BoxIcon = icon(
  <>
    <path d="M2.5 5 8 2.2 13.5 5v6L8 13.8 2.5 11z" />
    <path d="M2.5 5 8 7.8 13.5 5M8 7.8v6" />
  </>,
);
export const UsersIcon = icon(
  <>
    <circle cx="5.6" cy="5.4" r="2.2" />
    <path d="M1.8 13.4c.4-2.4 1.9-3.7 3.8-3.7s3.4 1.3 3.8 3.7M10.6 3.6a2.2 2.2 0 0 1 0 3.7M11.8 9.9c1.3.4 2.1 1.5 2.4 3.1" />
  </>,
);
export const ContactIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <circle cx="8" cy="6.6" r="1.7" />
    <path d="M5 12.4c.4-1.6 1.6-2.4 3-2.4s2.6.8 3 2.4" />
  </>,
);
export const TruckIcon = icon(
  <>
    <path d="M1.5 3.5h8v7h-8zM9.5 6h3l2 2.4V10.5h-5" />
    <circle cx="4.5" cy="11.8" r="1.4" />
    <circle cx="11.5" cy="11.8" r="1.4" />
  </>,
);
export const CoinsIcon = icon(
  <>
    <ellipse cx="8" cy="4" rx="5" ry="2.2" />
    <path d="M3 4v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V4M3 8v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V8" />
  </>,
);
export const BuildingIcon = icon(
  <>
    <path d="M3 13.5V3.2l6-1.2v11.5M9 5.5l4 1.2v6.8M3 13.5h10.5" />
    <path d="M5 5h1.5M5 7.5h1.5M5 10h1.5" />
  </>,
);
export const ChartIcon = icon(
  <path d="M2.5 13.5h11M4 11V7M7.3 11V4.5M10.6 11V8.5M13 11V3" />,
);
export const GearIcon = icon(
  <>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
  </>,
);
export const BellIcon = icon(
  <>
    <path d="M8 2a4 4 0 0 1 4 4c0 3 .8 4 1.5 4.6H2.5C3.2 10 4 9 4 6a4 4 0 0 1 4-4z" />
    <path d="M6.6 13a1.5 1.5 0 0 0 2.8 0" />
  </>,
);
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </>,
);
export const PlusIcon = icon(<path d="M8 3v10M3 8h10" />);
export const ChevronRightIcon = icon(<path d="m6 3.5 4.5 4.5L6 12.5" />);
export const ChevronLeftIcon = icon(<path d="m10 3.5-4.5 4.5L10 12.5" />);
export const ChevronDownIcon = icon(<path d="m3.5 6 4.5 4.5L12.5 6" />);
export const ClockIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </>,
);
export const CheckIcon = icon(<path d="m3 8.5 3.2 3L13 4.5" />);
export const XIcon = icon(<path d="m4 4 8 8M12 4l-8 8" />);
export const ArrowLeftIcon = icon(<path d="M13 8H3m4.5-4.5L3 8l4.5 4.5" />);
export const SunIcon = icon(
  <>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
  </>,
);
export const MoonIcon = icon(
  <path d="M13.5 9.3A5.7 5.7 0 0 1 6.7 2.5a5.7 5.7 0 1 0 6.8 6.8z" />,
);
export const KeyboardIcon = icon(
  <>
    <rect x="1.5" y="5" width="13" height="7" rx="1" />
    <path d="M4 8h.01M6.5 8h.01M9 8h.01M11.5 8h.01M5.5 10.5h5" />
  </>,
);
export const WifiOffIcon = icon(
  <>
    <path d="M2 2l12 12M5 8.6a6 6 0 0 1 2.5-1.4M2.8 6.2a9 9 0 0 1 2-1.3M8.4 5.2a9 9 0 0 1 4.8 2.4M10.8 8.8a6 6 0 0 1 .8.7" />
    <circle cx="8" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </>,
);
export const DownloadIcon = icon(
  <path d="M12 9v6M9 12l3 3 3-3M3 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />,
);
export const CheckCircleIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.2 8.3 2 2L11 6.2" />
  </>,
);
export const XCircleIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
  </>,
);
export const AlertTriangleIcon = icon(
  <>
    <path d="M8 2.2 14.5 13.3H1.5z" />
    <path d="M8 6.5v3M8 11.8h.01" />
  </>,
);
export const FileTextIcon = icon(
  <>
    <path d="M4 1.8h5.5L12.5 5v9.2h-8.5z" />
    <path d="M9.5 1.8V5h3M6 8h4M6 10.5h4" />
  </>,
);
