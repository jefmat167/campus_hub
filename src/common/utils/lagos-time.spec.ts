import { lagosWallClock } from './lagos-time';

describe('lagosWallClock', () => {
  it('reads HH:MM as Lagos time (UTC+1), whatever zone the process runs in', () => {
    expect(lagosWallClock('2026-10-01', '14:00').toISOString()).toBe(
      '2026-10-01T13:00:00.000Z',
    );
  });

  it('crosses midnight correctly (00:30 WAT is the previous UTC day)', () => {
    expect(lagosWallClock('2026-10-01', '00:30').toISOString()).toBe(
      '2026-09-30T23:30:00.000Z',
    );
  });

  it('accepts a date-column value (UTC midnight Date) for the same calendar day', () => {
    expect(lagosWallClock(new Date('2026-10-01'), '14:00').toISOString()).toBe(
      '2026-10-01T13:00:00.000Z',
    );
  });
});
