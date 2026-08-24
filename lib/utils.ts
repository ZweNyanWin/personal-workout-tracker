import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Keep post-auth redirects on this application origin. */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "https://powerbuild.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/** Format kg weight: shows decimal only when needed (100 → "100", 102.5 → "102.5") */
export function formatWeight(kg: number | null | undefined): string {
  if (kg == null) return "—";
  return kg % 1 === 0 ? kg.toString() : kg.toFixed(1);
}

/** Epley estimated 1RM formula */
export function estimateE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Brzycki formula — slightly more accurate at lower reps */
export function estimateE1RMBrzycki(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight / (1.0278 - 0.0278 * reps));
}

/** Format duration in seconds to "mm:ss" */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format minutes to "Xh Ym" */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Format date "2024-03-15" → "Mar 15" */
export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Format date "2024-03-15" → "Mar 15, 2024" */
export function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Days ago from a date string */
export function daysAgo(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - then.getTime()) / 86_400_000);
}

/** "today" | "yesterday" | "3 days ago" | "Mar 15" */
export function relativeDate(dateStr: string): string {
  const d = daysAgo(dateStr);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d <= 6) return `${d} days ago`;
  return formatDate(dateStr);
}

/** Calculate total volume for a set of sets */
export function calcVolume(
  sets: { weight_kg: number | null; reps: number | null; is_completed: boolean }[]
): number {
  return sets
    .filter((s) => s.is_completed && s.weight_kg && s.reps)
    .reduce((acc, s) => acc + (s.weight_kg! * s.reps!), 0);
}

/** Get week label "2024-W12" from a date string */
export function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const week = Math.ceil(
    ((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7
  );
  return `${year}-W${week.toString().padStart(2, "0")}`;
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Get initials from a name */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/** Session colour coding */
export const SESSION_COLORS: Record<string, string> = {
  "Upper A": "text-orange-700 dark:text-orange-300",
  "Lower A": "text-blue-700 dark:text-blue-300",
  "Upper B": "text-amber-700 dark:text-amber-300",
  "Lower B": "text-cyan-700 dark:text-cyan-300",
};

export const SESSION_BG_COLORS: Record<string, string> = {
  "Upper A": "bg-orange-500/10 text-orange-700 border-orange-500/25 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30",
  "Lower A": "bg-blue-500/10 text-blue-700 border-blue-500/25 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
  "Upper B": "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  "Lower B": "bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30",
};

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Parse a string to a float, returning null if invalid */
export function parseFloatOrNull(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Parse a string to an int, returning null if invalid */
export function parseIntOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}
