import type { SVGProps } from "react";

/** Same glyph as lucide's Play, drawn inline (24x24, stroke 2, round caps). */
export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
