/**
 * Campus Hub users are all in Nigeria, and a meet-up's `deliveryDate` +
 * `deliveryTime` are what the seller typed on their phone — Lagos wall-clock
 * time. Nigeria is UTC+1 all year (WAT, no daylight saving), so a fixed offset
 * is exact. Never use `setHours()` for this: it applies the *server's* zone,
 * which is UTC on a typical host (14:00 typed → 15:00 WAT).
 */
export const LAGOS_UTC_OFFSET = '+01:00';

/**
 * The instant for a Lagos calendar date (`YYYY-MM-DD`, or a `date`-column
 * value) and `HH:MM` time.
 */
export function lagosWallClock(date: string | Date, time: string): Date {
  // A `date` column / `new Date('YYYY-MM-DD')` is UTC midnight of that day, so
  // its ISO date part is the calendar day we want.
  const day = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return new Date(`${day}T${time}:00${LAGOS_UTC_OFFSET}`);
}
