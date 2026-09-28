/**
 * skyreconstruct — reconstruct the sky above any place at any instant.
 *
 * Pure functions, zero dependencies, no I/O. Accuracy budget: nutation, aberration
 * and polar motion are ignored (<0.02°). Every function is pinned to a published
 * reference value — see test/astronomy.test.ts:
 *   GMST @ J2000.0   = 280.460618°   (IAU 1982 exact value)
 *   Meeus ex.12(a)   = 128.7378733°  (Jean Meeus, Astronomical Algorithms)
 *   IAU76 precession round-trip      < 0.002°
 *
 * Coordinate conventions:
 *   Catalog coordinates are J2000 (epoch J2000.0). The zenith of an instant is
 *   computed on the mean-of-date frame (RA = LST, Dec = latitude), then
 *   precessed to J2000 to match catalog positions.
 *
 * Reference implementations:
 *   GMST          IAU 1982 / Explanatory Supplement
 *   Precession   IAU 1976 (three-term polynomial)
 *   Alt-az        Meeus ch. 13, with the azimuth normalised to north-based
 *                 (north = 0°, east-positive). Note the common Meeus
 *                 south-based atan2 form differs by exactly 180°; the tests
 *                 pin this convention explicitly.
 *
 * Algorithms from the public domain (Astronomical Algorithms, Meeus; Explanatory
 * Supplement to the Astronomical Almanac). MIT licensed.
 */

const DEG = Math.PI / 180;
const J2000_JD = 2451545.0;

export interface RaDec {
  ra: number; // 度 J2000
  dec: number; // 度 J2000
}

export interface AltAz {
  alt: number; // 度,地平以上为正
  az: number; // 度,北=0 东转 0-360
}

/** Unix 毫秒 → 儒略日(UT≈TT,与星表历元对比的误差 <0.02° 预算内可忽略 ΔT) */
export function jdFromUnixMs(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

export function gmstDeg(jd: number): number {
  const T = (jd - J2000_JD) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - J2000_JD) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

/** 世纪数(J2000 起,负 = 之前) */
export function centuriesSinceJ2000(jd: number): number {
  return (jd - J2000_JD) / 36525;
}

/** IAU76 岁差:把历元 T(世纪数)的赤道坐标转到 J2000(probe 已验证) */
export function precessToJ2000(raDeg: number, decDeg: number, T: number): RaDec {
  const Tn = -T;
  const zeta = (0.6406161 * Tn + 0.0000839 * Tn * Tn + 0.000005 * Tn ** 3) * DEG;
  const z = (0.6406161 * Tn + 0.0003041 * Tn * Tn + 0.0000051 * Tn ** 3) * DEG;
  const theta = (0.556753 * Tn - 0.0001185 * Tn * Tn - 0.0000116 * Tn ** 3) * DEG;
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const A = Math.cos(d) * Math.sin(a + zeta);
  const B = Math.cos(theta) * Math.cos(d) * Math.cos(a + zeta) - Math.sin(theta) * Math.sin(d);
  const C = Math.sin(theta) * Math.cos(d) * Math.cos(a + zeta) + Math.cos(theta) * Math.sin(d);
  const ra = (Math.atan2(A, B) + z) / DEG;
  const dec = Math.asin(Math.max(-1, Math.min(1, C))) / DEG;
  return { ra: ((ra % 360) + 360) % 360, dec };
}

/** J2000 星表坐标 → 目标历元 T(世纪数,可为负) */
export function precessFromJ2000(raDeg: number, decDeg: number, T: number): RaDec {
  return precessToJ2000(raDeg, decDeg, -T);
}

/** 含自行传播(pm 单位为 mas/年;星库行暂未存 pm,数据管线补齐后启用) */
export function propagateProperMotion(ra: number, dec: number, pmRaMasPerYear: number, pmDecMasPerYear: number, years: number): RaDec {
  // pmra 为 μ_α*·cosδ(mas/年),pmdec 为 μ_δ(mas/年)(HYG/Gaia 约定)
  if (!pmRaMasPerYear && !pmDecMasPerYear) return { ra, dec };
  return { ra: (ra + (pmRaMasPerYear * years) / 3600000 + 360) % 360, dec: dec + (pmDecMasPerYear * years) / 3600000 };
}

/** 当日历元(mean-of-date)地平坐标:RA/Dec 为 J2000,先岁差到观测时刻 */
export function raDecToAltAz(ra2000: number, dec2000: number, latDeg: number, lngDeg: number, jd: number): AltAz {
  const T = centuriesSinceJ2000(jd);
  const { ra, dec } = precessFromJ2000(ra2000, dec2000, T);
  return raDecOfDateToAltAz(ra, dec, latDeg, lngDeg, jd);
}

/** RA/Dec 已为当日历元时的地平坐标(时角公式) */
export function raDecOfDateToAltAz(raDeg: number, decDeg: number, latDeg: number, lngDeg: number, jd: number): AltAz {
  const lst = gmstDeg(jd) + lngDeg;
  let H = (lst - raDeg) % 360;
  if (H > 180) H -= 360;
  if (H < -180) H += 360;
  const phi = latDeg * DEG;
  const delta = decDeg * DEG;
  const h = H * DEG;
  const sinAlt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
  // 2026-09-10 修正:atan2 式为 Meeus 南起算式(南=0 向西转),与注释/消费方约定的
  // “北=0 东转”恒差 180°。+180 归一为北起(正北=0、东=90、南=180、西=270)。
  const azSouth = (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) / DEG + 360) % 360;
  const az = (azSouth + 180) % 360;
  return { alt, az };
}

/** 出生时刻天顶(当日历元):RA=LST, Dec=lat;返回 J2000 供星表匹配 */
export function zenithAt(utcMs: number, latDeg: number, lngDeg: number): RaDec {
  const jd = jdFromUnixMs(utcMs);
  const lst = (gmstDeg(jd) + lngDeg) % 360;
  return precessToJ2000(lst, latDeg, centuriesSinceJ2000(jd));
}

export function angularDistance(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const d1 = dec1 * DEG;
  const d2 = dec2 * DEG;
  const da = ((ra1 - ra2) % 360) * DEG;
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(da);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

export interface NearbyStar<T> {
  star: T;
  distanceDeg: number;
}

/** O(n) 最近星匹配(全天空 10.8 万 ~10ms 级;按天顶距离升序) */
export function nearestStars<T extends { ra_degrees: number; dec_degrees: number }>(stars: T[], ra2000: number, dec2000: number, limit: number): NearbyStar<T>[] {
  const scored: NearbyStar<T>[] = new Array(stars.length);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    scored[i] = { star: s, distanceDeg: angularDistance(ra2000, dec2000, s.ra_degrees, s.dec_degrees) };
  }
  scored.sort((a, b) => a.distanceDeg - b.distanceDeg);
  return scored.slice(0, limit);
}

export interface VisibleWindow {
  startUtcMs: number; // alt >= 0 进入
  endUtcMs: number;
  peakUtcMs: number; // 中天附近最高点
  peakAlt: number;
}

/**
 * 给定 UTC 日界内的可见窗口:从 startUtcMs 起按 stepMs 采样 24h,
 * alt>0 的连续区间合并为窗口。返回空数组 = 全天不可见。
 */
export function visibleWindows(ra2000: number, dec2000: number, latDeg: number, lngDeg: number, startUtcMs: number, stepMs = 6 * 60 * 1000): VisibleWindow[] {
  const windows: VisibleWindow[] = [];
  let cur: VisibleWindow | null = null;
  for (let t = startUtcMs; t < startUtcMs + 86400000; t += stepMs) {
    const jd = jdFromUnixMs(t);
    const { alt } = raDecToAltAz(ra2000, dec2000, latDeg, lngDeg, jd);
    if (alt > 0) {
      if (!cur) cur = { startUtcMs: t, endUtcMs: t, peakUtcMs: t, peakAlt: alt };
      cur.endUtcMs = t;
      if (alt > cur.peakAlt) {
        cur.peakAlt = alt;
        cur.peakUtcMs = t;
      }
    } else if (cur) {
      windows.push(cur);
      cur = null;
    }
  }
  if (cur) windows.push(cur);
  return windows;
}
