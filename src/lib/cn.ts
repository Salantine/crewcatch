import { clsx, type ClassValue } from "clsx";

/** Conditional class composition. No tailwind-merge: the surface area is small
 *  enough that a merge would be speculative complexity. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
