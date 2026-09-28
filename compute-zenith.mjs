#!/usr/bin/env node
/**
 * compute-zenith.mjs — find the catalog star closest to the zenith and emit a
 * ready-to-paste `zenith_star.inc`.
 *
 * This is the step that otherwise means opening a web calculator and copying
 * four numbers by hand. Here it is one command.
 *
 *   node compute-zenith.mjs --at 1955-04-18T06:15:00Z --lat 40.3573 --lon -74.6672 \
 *        --catalog hyg.json
 *
 * The catalog is a JSON array of { ra_degrees, dec_degrees, ... } and may carry
 * any extra fields; they are passed through to the output verbatim, so
 * `designation`, `constellation` and `distance_ly` all survive if present.
 *
 * Any catalog with those two fields works — HYG, a trimmed Gaia export, a list
 * scraped from a public database. The script never needs the whole sky: it
 * filters to a ±15° declination band first, which is provably sufficient
 * because a star further than that from the zenith in declination can never be
 * the closest one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `compute-zenith — the catalog star nearest the zenith, written to zenith_star.inc

  node compute-zenith.mjs --at <iso> --lat <deg> --lon <deg> --catalog <file.json>
                          [--name <label>] [--out <file.inc>] [--all <n>]

  --at       instant, ISO-8601. Use UTC if the script will use UTC (recommended).
  --lat      latitude, north positive
  --lon      longitude, east positive
  --catalog  JSON array of { ra_degrees, dec_degrees, ... }
  --name     observer label written into the .inc
  --out      output path (default: zenith_star.inc)
  --all      also list the next N-1 candidates (default 1, i.e. just the winner)

  The catalog may be large; only a ±15° declination band is searched.
`;

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) fail(`--${k.slice(2)} needs a value`);
      return v;
    };
    if (k === '--at') out.at = val();
    else if (k === '--lat') out.lat = Number(val());
    else if (k === '--lon') out.lon = Number(val());
    else if (k === '--catalog') out.catalog = val();
    else if (k === '--name') out.name = val();
    else if (k === '--out') out.out = val();
    else if (k === '--all') out.all = Number(val());
    else if (k === '-h' || k === '--help') out.help = true;
    else out._.push(k);
  }
  return out;
}

function fail(msg) {
  process.stderr.write(`compute-zenith: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

const args = parse(process.argv.slice(2));
if (args.help || process.argv.length <= 2) {
  process.stdout.write(USAGE);
  process.exit(0);
}

for (const [k, v] of [
  ['--at', args.at],
  ['--lat', args.lat],
  ['--lon', args.lon],
  ['--catalog', args.catalog],
]) {
  if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) fail(`${k} is required`);
}
if (args.lat < -90 || args.lat > 90) fail(`--lat ${args.lat} out of range`);
if (args.lon < -180 || args.lon > 360) fail(`--lon ${args.lon} out of range`);

// The engine ships as TypeScript, so it has to be built before this script can
// load it. Windows additionally requires a file:// URL rather than a bare path.
const built = path.join(here, 'engine', 'dist', 'index.js');
if (!fs.existsSync(built)) {
  fail('engine is not built — run this first:\n  cd engine && npm install && npm run build');
}
const engineMod = await import(pathToFileURL(built).href);
const { reconstructZenith, nearestStars, formatRa, formatDec } = engineMod;

const utcMs = Date.parse(args.at);
if (!Number.isFinite(utcMs)) fail(`could not parse --at "${args.at}"`);

const catalogPath = path.resolve(args.catalog);
if (!fs.existsSync(catalogPath)) fail(`catalog not found: ${catalogPath}`);

let stars;
try {
  stars = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
} catch (e) {
  fail(`could not parse ${catalogPath} as JSON: ${e.message}`);
}
if (!Array.isArray(stars)) fail('catalog must be a JSON array of star objects');
if (!stars.length) fail('catalog is empty');

// Field names vary by catalog (HYG, Gaia exports, VizieR dumps), so accept the
// common spellings rather than demanding one exact schema.
const RA_KEYS = ['ra_degrees', 'ra', 'RA', 'ra_deg', 'RA_deg'];
const DEC_KEYS = ['dec_degrees', 'dec', 'Dec', 'dec_deg', 'Dec_deg'];
const raKey = RA_KEYS.find((k) => k in stars[0]);
const decKey = DEC_KEYS.find((k) => k in stars[0]);
if (!raKey) fail(`no right-ascension field found. Looked for: ${RA_KEYS.join(', ')}`);
if (!decKey) fail(`no declination field found. Looked for: ${DEC_KEYS.join(', ')}`);

const { ofDate, j2000 } = reconstructZenith(utcMs, args.lat, args.lon);

// ±15° declination band: a star outside it is at least that far from the zenith
// in dec, so it cannot be the nearest regardless of right ascension.
const BAND = 15;
const band = stars
  .filter((s) => Number.isFinite(s[raKey]) && Number.isFinite(s[decKey]))
  .map((s) => ({ ra_degrees: Number(s[raKey]), dec_degrees: Number(s[decKey]), _raw: s }));
if (!band.length) fail(`no catalog stars within ±${BAND}° of dec ${j2000.dec.toFixed(2)}°`);

const ranked = nearestStars(band, j2000.ra, j2000.dec, args.all ?? 1);
const best = ranked[0].star;
const sep = ranked[0].distanceDeg;

const pick = (s, ...keys) => {
  for (const k of keys) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== '') return s[k];
  }
  return undefined;
};

const raw = best._raw;
const designation =
  pick(raw, 'designation', 'gaia_source_id', 'hip', 'hip_id', 'catalog_id', 'source_id', 'HR', 'id', 'name') ??
  '(unavailable in this catalog)';
const mag = pick(raw, 'mag', 'phot_g_mean_mag', 'magnitude', 'v_mag');
const distLy = pick(raw, 'distance_ly', 'dist_ly', 'distance');
const constellation = pick(raw, 'constellation_name', 'constellation_en', 'constellation', 'con', 'con_name');

const outPath = path.resolve(args.out ?? path.join(here, 'zenith_star.inc'));
const name = args.name ?? `${args.lat}, ${args.lon}`;

const inc = `// Zenith Star — the catalog star closest to the zenith for the date/time/location
// configured in historical_sky.inc.
//
// Generated by compute-zenith.mjs:
//   node compute-zenith.mjs --at ${args.at} --lat ${args.lat} --lon ${args.lon} \\
//        --catalog ${path.basename(catalogPath)}${args.name ? ` --name "${args.name}"` : ''}
//
// Zenith at that instant (J2000): RA ${formatRa(j2000.ra)}  Dec ${formatDec(j2000.dec)}

var ZS_HIP      = ${JSON.stringify(String(designation))};  // catalog designation
var ZS_MAG      = ${mag !== undefined ? Number(mag) : 'null'};${mag !== undefined ? '         // apparent magnitude' : '  // not present in this catalog'}
var ZS_DIST_DEG = ${sep.toFixed(2)};         // angular distance from the zenith, degrees
var ZS_CONST    = ${JSON.stringify(constellation !== undefined ? String(constellation) : '(unavailable)')};     // constellation
`;

fs.writeFileSync(outPath, inc);

console.log(`Zenith (J2000)   ${formatRa(j2000.ra)}   ${formatDec(j2000.dec)}`);
console.log(`Nearest star     ${designation}${constellation ? `  in ${constellation}` : ''}`);
if (mag !== undefined) console.log(`Magnitude        ${mag}`);
if (distLy !== undefined) console.log(`Distance         ${Math.round(distLy)} ly`);
console.log(`From zenith      ${sep.toFixed(4)}°`);
console.log(`Searched         ${band.length} of ${stars.length} catalog entries (±${BAND}° declination band)`);
if (ranked.length > 1) {
  console.log('\nRunners-up');
  for (const r of ranked.slice(1)) {
    const d = pick(r.star._raw, 'designation', 'gaia_source_id', 'hip', 'hip_id', 'catalog_id', 'source_id', 'id', 'name');
    console.log(`  ${String(d).padEnd(14)} ${r.distanceDeg.toFixed(4)}°`);
  }
}
console.log(`\nWrote ${outPath}`);

// A partial or sampled catalog silently yields a plausible-looking wrong answer,
// because "closest entry in this file" is not "closest star in the sky". Say so.
if (band.length < 50) {
  console.warn(
    `\n  WARNING: only ${band.length} entries fell in the search band.\n` +
      `  If this catalog is a sample rather than a whole-sky one, the result is the\n` +
      `  closest entry IN THE FILE, not the closest star in the sky. Use a complete\n` +
      `  catalog (HYG, Gaia DR3) before trusting this number.`
  );
}
void ofDate;
