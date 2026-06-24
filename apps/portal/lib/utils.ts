import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui class-name helper: merges conditional clsx output and de-dupes
 * conflicting Tailwind classes (e.g. `px-2 px-4` -> `px-4`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
