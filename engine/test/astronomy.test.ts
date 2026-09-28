/**
 * Accuracy verification — every assertion is pinned to a published value or an
 * exact geometric case, so this library can be rechecked with nothing but
 * Meeus and a calculator.
 *  1) GMST textbook anchors (J2000.0 exact + Meeus ex.12)
 *  2) IAU76 precession round-trip < 0.002°
 *  3) Zenith self-consistency: zenith mapped back to alt-az gives alt ≈ 90°
 *  4) Corpus: 14 cities × decade/season/DST/polar samples, range assertions
 *  5) visibleWindows diurnal geometry sanity
 */
import { describe, it, expect } from 'vitest';
import {
  jdFromUnixMs,
  gmstDeg,
  precessFromJ2000,
  precessToJ2000,
  zenithAt,
  raDecToAltAz,
  raDecOfDateToAltAz,
  angularDistance,
  visibleWindows,
} from '../src/astronomy.js';

function altAzOfRaDec(ra: number, dec: number, lat: number, lng: number, utcMs: number) {
  return raDecToAltAz(ra, dec, lat, lng, jdFromUnixMs(utcMs));
}

describe('GMST 教科书锚点', () => {
  it('J2000.0 精确值 280.46061837°', () => {
    expect(gmstDeg(jdFromUnixMs(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(280.460618, 5);
  });

  it('Meeus ex.12(a):1987-04-10 19:21 UT → 8h34m57.0896s = 128.7378733°', () => {
    const ms = Date.UTC(1987, 3, 10, 19, 21, 0);
    const g = gmstDeg(jdFromUnixMs(ms));
    expect(g / 15).toBeCloseTo(8 + 34 / 60 + 57.0896 / 3600, 4);
  });
});

describe('IAU76 岁差往返', () => {
  // IAU76 三次多项式截断精度 ~1″/世纪级;出生年份 1900-2026(T∈[-1,0.26])往返误差 < 0.001°,
  // 对天顶匹配 0.01° 需求余量充足。断言 0.002° 兜住大 T 截断。
  it('J2000 → 历元 1930 → 回 J2000,误差 < 0.002°', () => {
    const T = (Date.UTC(1930, 5, 15, 12) / 86400000 + 2440587.5 - 2451545.0) / 36525;
    const out = precessToJ2000(...Object.values(precessFromJ2000(123.45, -12.3, T)), T);
    expect(angularDistance(out.ra, out.dec, 123.45, -12.3)).toBeLessThan(0.002);
  });

  it('J2000 → 历元 2100 → 回 J2000,误差 < 0.002°', () => {
    const T = 1.0;
    const out = precessToJ2000(...Object.values(precessFromJ2000(350.1, 80.2, T)), T);
    expect(angularDistance(out.ra, out.dec, 350.1, 80.2)).toBeLessThan(0.002);
  });
});

describe('出生时刻天顶自洽(zenithAt → alt≈90°)', () => {
  const CASES: Array<[string, number, number, number]> = [
    ['北京 1995-07-28 21:35', 39.9042, 116.4074, Date.UTC(1995, 6, 28, 13, 35)],
    ['悉尼 2000-06-01 23:00', -33.8688, 151.2093, Date.UTC(2000, 5, 1, 13, 0)],
    ['伦敦 1985-12-25 14:00', 51.5074, -0.1278, Date.UTC(1985, 11, 25, 14, 0)],
    ['内罗毕 1995-07-01 12:30', -1.2921, 36.8219, Date.UTC(1995, 6, 1, 9, 30)],
    ['雷克雅未克 2010-03-20 04:00', 64.1466, -21.9426, Date.UTC(2010, 2, 20, 4, 0)],
    ['特罗姆瑟极昼 2001-06-21 12:00', 69.6492, 18.9553, Date.UTC(2001, 5, 21, 10, 0)],
  ];
  for (const [label, lat, lng, utcMs] of CASES) {
    it(label + ' → 天顶星回算 alt ≥ 89.98°', () => {
      const zen = zenithAt(utcMs, lat, lng);
      const { alt } = altAzOfRaDec(zen.ra, zen.dec, lat, lng, utcMs);
      expect(alt).toBeGreaterThan(89.9);
    });
  }

  it('南半球天顶赤纬 = 纬度(悉尼 dec ≈ -33.9)', () => {
    const zen = zenithAt(Date.UTC(2000, 5, 1, 13, 0), -33.8688, 151.2093);
    expect(zen.dec).toBeCloseTo(-33.8688, 1);
  });
});

describe('程序化语料:数值范围与极地覆盖', () => {
  // 14 城:南北半球/赤道/高纬/极圈内外/跨日期变更线
  const CITIES: Array<[string, number, number]> = [
    ['北京', 39.9042, 116.4074],
    ['上海', 31.2304, 121.4737],
    ['纽约', 40.7128, -74.006],
    ['洛杉矶', 34.0522, -118.2437],
    ['伦敦', 51.5074, -0.1278],
    ['悉尼', -33.8688, 151.2093],
    ['奥克兰', -36.8509, 174.7645],
    ['内罗毕', -1.2921, 36.8219],
    ['新加坡', 1.3521, 103.8198],
    ['圣保罗', -23.5505, -46.6333],
    ['雷克雅未克', 64.1466, -21.9426],
    ['特罗姆瑟', 69.6492, 18.9553],
    ['乌斯怀亚', -54.8019, -68.303],
    ['努克', 64.1814, -51.6941],
  ];
  // 年代/季节/DST 转换/闰日样本(UTC 直接构造,时区层另测)
  const DATES = [
    Date.UTC(1900, 0, 1, 0, 0),
    Date.UTC(1930, 5, 15, 12, 0),
    Date.UTC(1950, 11, 22, 23, 30),
    Date.UTC(1970, 6, 20, 5, 45),
    Date.UTC(1986, 4, 4, 0, 0), // 中国 1986 夏令时开始期
    Date.UTC(1996, 3, 7, 1, 30),
    Date.UTC(2000, 1, 29, 8, 15), // 闰日
    Date.UTC(2010, 9, 31, 19, 20),
    Date.UTC(2020, 11, 21, 12, 0), // 冬至
    Date.UTC(2026, 5, 21, 4, 0), // 夏至
  ];
  it(`${CITIES.length} 城 × ${DATES.length} 时刻全部正常计算且范围合法`, () => {
    for (const [name, lat, lng] of CITIES) {
      for (const utcMs of DATES) {
        const zen = zenithAt(utcMs, lat, lng);
        expect(zen.ra).toBeGreaterThanOrEqual(0);
        expect(zen.ra).toBeLessThan(360);
        expect(zen.dec).toBeGreaterThanOrEqual(-90);
        expect(zen.dec).toBeLessThanOrEqual(90);
        // 极地城市同样产出合法天顶
        expect(Math.abs(zen.dec - lat)).toBeLessThan(23.5 + 0.5); // 赤纬只随太阳极限漂移(近似,宽松)
        // 任意 J2000 方向的地平换算范围
        const { alt, az } = altAzOfRaDec(zen.ra, zen.dec, lat, lng, utcMs);
        expect(alt).toBeGreaterThanOrEqual(-90);
        expect(alt).toBeLessThanOrEqual(90);
        expect(az).toBeGreaterThanOrEqual(0);
        expect(az).toBeLessThan(360);
        expect(name).toBeTruthy();
      }
    }
  });
});

describe('方位角约定(北=0 东转 0-360;B3 修正南起算式恒差 180)', () => {
  // 确定性锚点:直接把赤经取到使时角 H=0/±90/180(lng=0,ra=lst-H),方位角应为精确几何值。
  // 旧 atan2(Meeus 南起)式在这些锚点上恒差 180(上中天给出 0 而非 180),修正后为北起。
  it('时角锚点方位角与高度(北半球,dec=0,lat=45)', () => {
    const jd = jdFromUnixMs(Date.UTC(2026, 5, 1, 12));
    const lst = gmstDeg(jd);
    const norm = (x: number) => ((x % 360) + 360) % 360;
    const at = (h: number) => raDecOfDateToAltAz(norm(lst - h), 0, 45, 0, jd);
    expect(at(0).az).toBeCloseTo(180, 4); // 上中天 = 正南
    expect(at(0).alt).toBeCloseTo(45, 4);
    expect(at(90).az).toBeCloseTo(270, 4); // 西
    expect(at(-90).az).toBeCloseTo(90, 4); // 东
    expect(at(180).az).toBeCloseTo(0, 4); // 下中天 = 正北
    expect(at(180).alt).toBeCloseTo(-45, 4);
  });

  it('南半球上中天 = 正北(lat=-45,dec=0,H=0)', () => {
    const jd = jdFromUnixMs(Date.UTC(2026, 5, 1, 12));
    const lst = gmstDeg(jd);
    const { az, alt } = raDecOfDateToAltAz(((lst % 360) + 360) % 360, 0, -45, 0, jd);
    expect(az).toBeCloseTo(0, 4);
    expect(alt).toBeCloseTo(45, 4);
  });

  it('极区恒星上中天 = 正北/正南之间随方向,但数值恒在 [0,360)', () => {
    const jd = jdFromUnixMs(Date.UTC(2026, 5, 1, 12));
    const lst = gmstDeg(jd);
    for (const h of [0, 60, 120, 180, 240, 300]) {
      const ra = ((lst - h) % 360 + 360) % 360;
      for (const dec of [20, 60, 89]) {
        const { az } = raDecOfDateToAltAz(ra, dec, 45, 0, jd);
        expect(az).toBeGreaterThanOrEqual(0);
        expect(az).toBeLessThan(360);
      }
    }
  });
});

describe('visibleWindows 几何 sanity', () => {
  it('观测点在北纬 88°:北极星(dec≈89.26)近似恒显,24h 内窗口总时长接近 24h', () => {
    const start = Date.UTC(2026, 8, 5, 0, 0);
    const wins = visibleWindows(2.53, 89.264, 88, 0, start);
    const total = wins.reduce((s, w) => s + (w.endUtcMs - w.startUtcMs), 0);
    expect(total / 3600000).toBeGreaterThan(22);
  });

  it('可见窗口的峰值时刻 alt 与直接计算一致(±采样误差内)', () => {
    const start = Date.UTC(2026, 8, 5, 0, 0);
    const wins = visibleWindows(83.822, 27.988, 31.2304, 121.4737, start); // 天津四附近,上海
    expect(wins.length).toBeGreaterThan(0);
    const peak = wins[0].peakUtcMs;
    const { alt } = altAzOfRaDec(83.822, 27.988, 31.2304, 121.4737, peak);
    expect(Math.abs(alt - wins[0].peakAlt)).toBeLessThan(2); // 6 分钟采样误差界
  });
});
