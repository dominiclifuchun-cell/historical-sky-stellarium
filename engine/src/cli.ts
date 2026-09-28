#!/usr/bin/env node
/**
 * skyreconstruct CLI — reconstruct the sky above a place at an instant.
 *
 *   skyreconstruct at 1955-04-18T06:15:00Z --lat 40.3573 --lon -74.6672
 *   skyreconstruct where 83.822 27.988 --at 2026-09-25T01:52:00Z --lat 31.2 --lon 121.5
 *   skyreconstruct arc 83.822 27.988 --lat 31.2 --lon 121.5
 */
import {
  reconstructZenith,
  reconstructAltAz,
  reconstructDiurnalArc,
  localSiderealTimeDeg,
  angularDistance,
  formatRa,
  formatDec,
} from './index.js';

const USAGE = `skyreconstruct — reconstruct the real sky above any place at any instant

USAGE
  skyreconstruct at [<iso>] --lat <deg> --lon <deg> [<ra> <dec>]
      The zenith at that instant. With a catalog position, also shows where that
      star sits and how far it is from directly overhead.

  skyreconstruct where <ra> <dec> --at <iso> --lat <deg> --lon <deg>
      Altitude and azimuth of a J2000 catalog position, at that spot and instant.

  skyreconstruct arc <ra> <dec> --at <iso> --lat <deg> --lon <deg> [--step <min>]
      One day of that star's motion, sampled. Shows rise, transit, set.

COMMON OPTIONS
  --lat <deg>    Latitude, degrees north positive
  --lon <deg>    Longitude, degrees east positive
  --at <iso>     Instant (default: now). May also be given bare, as above.
  --step <min>   Sampling interval for 'arc' (default 10)
  -h, --help     This message

NOTES
  ra/dec are J2000 catalog degrees. Accuracy budget ignores nutation, aberration
  and polar motion (< 0.02 deg). Azimuth is north-based: 0 = north, 90 = east.

EXAMPLES
  # Zenith of the Einstein Memorial unveiling, National Academy of Sciences, DC
  skyreconstruct at 1979-04-22T16:00:00Z --lat 38.8976 --lon -77.0065

  # ...and how far a given star is from straight overhead at that moment
  skyreconstruct at 1979-04-22T16:00:00Z --lat 38.8976 --lon -77.0065 83.822 27.988

  # Vega from Shanghai tonight
  skyreconstruct where 279.2347 38.7837 --at 2026-09-27T13:00:00Z --lat 31.2 --lon 121.5
`;

interface Args {
  _: string[];
  lat?: number;
  lon?: number;
  at?: string;
  step?: number;
}

/** Bare ISO-8601 instants are accepted as a positional shorthand for --at.
 *  Without this, `at <iso> ... <ra> <dec>` collides: the iso would occupy the
 *  slot the optional star position expects. */
function isInstant(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T|\s)/.test(s);
}

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = (): number => {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) fail(`--${a.slice(2)} needs a number, got "${argv[i]}"`);
      return v;
    };
    switch (a) {
      case '--lat':
        out.lat = num();
        break;
      case '--lon':
        out.lon = num();
        break;
      case '--at':
        out.at = argv[++i];
        break;
      case '--step':
        out.step = num();
        break;
      default:
        out._.push(a);
    }
  }
  return out;
}

function fail(msg: string): never {
  process.stderr.write(`skyreconstruct: ${msg}\n\nRun with --help for usage.\n`);
  process.exit(1);
  throw new Error(msg); // unreachable; keeps the never return type
}

function instantOf(a: Args): number {
  if (!a.at) return Date.now();
  const t = Date.parse(a.at);
  if (!Number.isFinite(t)) fail(`could not parse --at "${a.at}" (use ISO-8601, e.g. 1979-04-22T16:00:00Z)`);
  return t;
}

/** Pull a bare ISO instant out of the positional list, leaving ra/dec behind. */
function liftInstant(a: Args): Args {
  if (a.at) return a;
  const idx = a._.findIndex((s) => s !== a._[0] && isInstant(s));
  if (idx < 0) return a;
  return { ...a, at: a._[idx], _: a._.filter((_, i) => i !== idx) };
}

/** Optional trailing <ra> <dec> for the `at` command. */
function optionalStar(a: Args): { ra: number; dec: number } | null {
  const n = a._.slice(1);
  if (n.length < 2) return null;
  const ra = Number(n[0]);
  const dec = Number(n[1]);
  return Number.isFinite(ra) && Number.isFinite(dec) ? { ra, dec } : null;
}

function needSpot(a: Args): { lat: number; lon: number } {
  if (a.lat === undefined || a.lon === undefined) fail('both --lat and --lon are required');
  if (a.lat < -90 || a.lat > 90) fail(`--lat ${a.lat} out of range (-90..90)`);
  if (a.lon < -180 || a.lon > 360) fail(`--lon ${a.lon} out of range (-180..360)`);
  return { lat: a.lat, lon: a.lon };
}

const iso = (ms: number) => new Date(ms).toISOString().replace('.000', '');

function cmdAt(raw: Args): void {
  const a = liftInstant(raw);
  const t = instantOf(a);
  const { lat, lon } = needSpot(a);
  const { ofDate, j2000 } = reconstructZenith(t, lat, lon);
  const extra = optionalStar(a);

  console.log(`Instant   ${iso(t)}`);
  console.log(`Site      lat ${lat}  lon ${lon}`);
  console.log(`Sidereal  ${localSiderealTimeDeg(t, lon).toFixed(4)}°`);
  console.log('');
  console.log('Zenith of that instant');
  console.log(`  mean-of-date   RA ${ofDate.ra.toFixed(4)}°   Dec ${ofDate.dec.toFixed(4)}°`);
  console.log(`  sexagesimal    ${formatRa(ofDate.ra)}   ${formatDec(ofDate.dec)}`);
  console.log(`  J2000          RA ${j2000.ra.toFixed(4)}°   Dec ${j2000.dec.toFixed(4)}°`);

  if (extra && Number.isFinite(extra.ra) && Number.isFinite(extra.dec)) {
    const { alt, az } = reconstructAltAz(extra.ra, extra.dec, lat, lon, t);
    const sep = angularDistance(j2000.ra, j2000.dec, extra.ra, extra.dec);
    console.log('');
    console.log(`Star at RA ${extra.ra} Dec ${extra.dec} (J2000)`);
    console.log(`  altitude      ${alt.toFixed(4)}°${alt > 0 ? '  (above the horizon)' : '  (below the horizon)'}`);
    console.log(`  azimuth       ${az.toFixed(4)}°  (north = 0, east = 90)`);
    console.log(`  from zenith   ${sep.toFixed(4)}°`);
    if (alt > 89.9) console.log('  → this is the star standing directly overhead at that instant.');
  } else {
    console.log('');
    console.log('Add a catalog position to see where a given star sits:');
    console.log(`  skyreconstruct at ${iso(t)} --lat ${lat} --lon ${lon} <ra> <dec>`);
  }
}

function cmdWhere(raw: Args): void {
  const a = liftInstant(raw);
  const t = instantOf(a);
  const { lat, lon } = needSpot(a);
  const ra = Number(a._[1]);
  const dec = Number(a._[2]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) fail('usage: skyreconstruct where <ra> <dec> --at <iso> --lat <deg> --lon <deg>');
  const { alt, az } = reconstructAltAz(ra, dec, lat, lon, t);
  console.log(`Instant   ${iso(t)}`);
  console.log(`Site      lat ${lat}  lon ${lon}`);
  console.log(`Star      RA ${ra}  Dec ${dec}  (J2000)`);
  console.log(`Altitude  ${alt.toFixed(4)}°${alt > 0 ? '  (above the horizon)' : '  (below the horizon)'}`);
  console.log(`Azimuth   ${az.toFixed(4)}°  (north = 0, east = 90)`);
}

function cmdArc(raw: Args): void {
  const a = liftInstant(raw);
  const t = instantOf(a);
  const { lat, lon } = needSpot(a);
  const ra = Number(a._[1]);
  const dec = Number(a._[2]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) fail('usage: skyreconstruct arc <ra> <dec> --at <iso> --lat <deg> --lon <deg>');
  const samples = reconstructDiurnalArc(ra, dec, lat, lon, t, a.step ?? 10);

  let rise: (typeof samples)[number] | null = null;
  let set: (typeof samples)[number] | null = null;
  let transit = samples[0];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].alt > transit.alt) transit = samples[i];
    const prev = samples[i - 1];
    if (prev && !prev.up && samples[i].up) rise = samples[i];
    if (prev && prev.up && !samples[i].up) set = samples[i];
  }

  console.log(`Star      RA ${ra}  Dec ${dec}  (J2000)`);
  console.log(`Site      lat ${lat}  lon ${lon}`);
  console.log(`Window    ${iso(t)}  + 24h, sampled every ${a.step ?? 10} min\n`);
  console.log(`  rises     ${rise ? iso(rise.utcMs).slice(11, 16) : '— (circulates without setting, or never rises)'}`);
  console.log(`  highest   ${iso(transit.utcMs).slice(11, 16)}   alt ${transit.alt.toFixed(2)}°   az ${transit.az.toFixed(2)}°`);
  console.log(`  sets      ${set ? iso(set.utcMs).slice(11, 16) : '—'}`);
  console.log('');
  console.log('  hh:mm  alt      az');
  for (const s of samples) {
    if (s.utcMs % (60 * 60 * 1000) !== 0) continue; // hourly readout
    console.log(`  ${iso(s.utcMs).slice(11, 16)}  ${s.alt.toFixed(2).padStart(7)}°  ${s.az.toFixed(2).padStart(7)}°${s.up ? '' : '   (below)'}`);
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return;
  }
  const args = parseArgs(argv);
  switch (args._[0]) {
    case 'at':
      return cmdAt(args);
    case 'where':
      return cmdWhere(args);
    case 'arc':
      return cmdArc(args);
    default:
      fail(`unknown command "${args._[0]}" — expected at, where, or arc`);
  }
}

main();
