/**
 * Two kinds of date live in this system and they must be formatted differently.
 *
 *  - Calendar dates (expiry, order date) are Postgres `date`, which Prisma
 *    returns as a Date at UTC midnight. Formatting those in the viewer's local
 *    timezone would shift them a day west of UTC, so they are always rendered
 *    with timeZone: "UTC" - printing the stored calendar date verbatim.
 *
 *  - Instants (when a movement was recorded) are real points in time and are
 *    rendered in the pharmacy timezone.
 */

/** Renders a stored calendar date exactly as recorded: "14 Mar 2027". */
export function formatCivilDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** ISO form for inputs and exports: "2027-03-14". */
export function toCivilDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse a date input value as a calendar date, anchored at UTC midnight. */
export function fromCivilDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** An instant, in the pharmacy timezone: "14 Mar 2027, 09:42". */
export function formatInstant(
  date: Date,
  timeZone: string,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/** Compact relative phrasing for activity feeds: "4 min ago", "yesterday". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(seconds / 86_400);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
