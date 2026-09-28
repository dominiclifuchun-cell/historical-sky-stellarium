/**
 * The convenience layer must agree with the core functions it wraps.
 *
 * This file exists because of a real bug: reconstructZenith initially called
 * precessFromJ2000 where it needed precessToJ2000, inverting the precession
 * direction. The result was 0.85° away from zenithAt for the same input — a
 * degree of error big enough to point at the wrong star, and small enough that
 * nothing looked obviously wrong. The core functions were fine; only the new
 * wrapper was wrong, and nothing was checking them against each other.
 */
import { describe, it, expect } from 'vitest';
import { zenithAt, angularDistance } from '../src/astronomy.js';
import { reconstructZenith, reconstructAltAz, localSiderealTimeDeg, formatRa, formatDec, toUnitVector } from '../src/index.js';

const CASES: Array<[string, number, number, number]> = [
  ['Princeton 1955-04-18 06:15Z', 40.3573, -74.6672, Date.UTC(1955, 3, 18, 6, 15)],
  ['Beijing 2026-08-28 14:00Z', 39.9042, 116.4074, Date.UTC(2026, 7, 28, 14, 0)],
  ['Sydney 2000-06-01 13:00Z', -33.8688, 151.2093, Date.UTC(2000, 5, 1, 13, 0)],
  ['London 1985-12-25 14:00Z', 51.5074, -0.1278, Date.UTC(1985, 11, 25, 14, 0)],
  ['Tromso midsummer 2001', 69.6492, 18.9553, Date.UTC(2001, 5, 21, 10, 0)],
];

describe('reconstructZenith agrees with zenithAt', () => {
  for (const [label, lat, lng, ms] of CASES) {
    it(label, () => {
      const a = reconstructZenith(ms, lat, lng).j2000;
      const b = zenithAt(ms, lat, lng);
      // Must match, not merely be close. The 0.85° bug passed anything looser.
      expect(angularDistance(a.ra, a.dec, b.ra, b.dec)).toBeLessThan(1e-6);
    });
  }

  it('mean-of-date declination is exactly the latitude', () => {
    for (const [, lat, lng, ms] of CASES) {
      expect(reconstructZenith(ms, lat, lng).ofDate.dec).toBe(lat);
    }
  });

  it('mean-of-date right ascension is the local sidereal time', () => {
    for (const [, lat, lng, ms] of CASES) {
      expect(reconstructZenith(ms, lat, lng).ofDate.ra).toBe(localSiderealTimeDeg(ms, lng));
    }
  });
});

describe('reconstructAltAz round-trips through the zenith', () => {
  it('the zenith maps to alt ≈ 90°', () => {
    for (const [label, lat, lng, ms] of CASES) {
      const { j2000 } = reconstructZenith(ms, lat, lng);
      const { alt } = reconstructAltAz(j2000.ra, j2000.dec, lat, lng, ms);
      expect(alt, label).toBeGreaterThan(89.9);
    }
  });
});

describe('formatting', () => {
  it('formatRa produces hours-minutes-seconds', () => {
    // 224.2474° = 14.9565h = 14h 57m 23.5s
    expect(formatRa(224.2474)).toMatch(/^14h \d{2}m \d{2}\.\d{2}s$/);
  });

  it('formatDec keeps the sign and stays in range', () => {
    expect(formatDec(40.535)).toMatch(/^\+40° \d{2}' \d{1,2}\.\d"$/);
    expect(formatDec(-33.8688)).toMatch(/^-33° \d{2}' \d{1,2}\.\d"$/);
  });

  it('toUnitVector is unit length', () => {
    for (const [ra, dec] of [
      [0, 0],
      [90, 45],
      [224.2474, 40.535],
      [359.9, -89.9],
    ]) {
      const [x, y, z] = toUnitVector(ra, dec);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    }
  });
});
