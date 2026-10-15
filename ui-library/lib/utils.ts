import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn's `cn`, which the ui-layouts sources import from `@/lib/utils`. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
