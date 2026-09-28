/**
 * skyreconstruct — reconstruct the sky above any place at any instant.
 *
 * Zero dependencies. No I/O. Every function is a pure transform you can verify
 * against Meeus, *Astronomical Algorithms*, or the *Explanatory Supplement*.
 */
export {
  jdFromUnixMs,
  gmstDeg,
  centuriesSinceJ2000,
  precessToJ2000,
  precessFromJ2000,
  propagateProperMotion,
  raDecToAltAz,
  raDecOfDateToAltAz,
  zenithAt,
  angularDistance,
  nearestStars,
  visibleWindows,
} from './astronomy.js';

export type { RaDec, AltAz, NearbyStar, VisibleWindow } from './astronomy.js';

import { jdFromUnixMs, gmstDeg, precessToJ2000, precessFromJ2000, raDecOfDateToAltAz } from './astronomy.js';
import type { RaDec } from './astronomy.js';

const DEG = Math.PI / 180;

/** Local apparent sidereal time in degrees (mean; nutation ignored per budget) */
export function localSiderealTimeDeg(utcMs: number, lngDeg: number): number {
  return ((gmstDeg(jdFromUnixMs(utcMs)) + lngDeg) % 360 + 360) % 360;
}

/**
 * The zenith of an instant, in both frames:
 *  - mean-of-date: RA = local sidereal time, Dec = latitude (exact definition)
 *  - J2000: the same point precessed, for matching catalog coordinates
 */
export function reconstructZenith(utcMs: number, latDeg: number, lngDeg: number): {
  ofDate: RaDec;
  j2000: RaDec;
} {
  const lst = localSiderealTimeDeg(utcMs, lngDeg);
  const ofDate: RaDec = { ra: lst, dec: latDeg };
  const T = (jdFromUnixMs(utcMs) - 2451545.0) / 36525;
  return { ofDate, j2000: precessToJ2000(ofDate.ra, ofDate.dec, T) };
}

/** Where a J2000 catalog position sits in the sky, as observed at an instant */
export function reconstructAltAz(
  raJ2000: number,
  decJ2000: number,
  latDeg: number,
  lngDeg: number,
  utcMs: number
): { alt: number; az: number } {
  const jd = jdFromUnixMs(utcMs);
  const T = (jd - 2451545.0) / 36525;
  const { ra, dec } = precessFromJ2000(raJ2000, decJ2000, T);
  return raDecOfDateToAltAz(ra, dec, latDeg, lngDeg, jd);
}

/**
 * Directions a star sweeps through one day, sampled and reduced to fixed points.
 * Useful for "when was this star visible from here" without a sky simulator.
 */
export function reconstructDiurnalArc(
  raJ2000: number,
  decJ2000: number,
  latDeg: number,
  lngDeg: number,
  utcMs: number,
  stepMinutes = 10
): Array<{ utcMs: number; alt: number; az: number; up: boolean }> {
  const out: Array<{ utcMs: number; alt: number; az: number; up: boolean }> = [];
  const step = stepMinutes * 60_000;
  for (let t = utcMs; t < utcMs + 86_400_000; t += step) {
    const { alt, az } = reconstructAltAz(raJ2000, decJ2000, latDeg, lngDeg, t);
    out.push({ utcMs: t, alt, az, up: alt > 0 });
  }
  return out;
}

/** Format decimal degrees as sexagesimal (RA in hms, Dec in dms) */
export function formatRa(raDeg: number): string {
  const totalHours = ((raDeg / 15) % 24 + 24) % 24;
  const h = Math.floor(totalHours);
  const m = Math.floor((totalHours - h) * 60);
  const s = ((totalHours - h) * 60 - m) * 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${s.toFixed(2)}s`;
}

export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? '-' : '+';
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${s.toFixed(1)}"`;
}

/** Unit vector of a J2000 direction, for projecting onto a globe or map */
export function toUnitVector(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}
