// Zenith Star -- the catalog star closest to the zenith for the date/time/location
// configured in historical_sky.inc.
//
// The values below are for the default configuration (Princeton, 1955-04-18 01:15 EST).
// To compute them for your own date, time and location, run:
//
//   cd engine && npm install && npm run build && cd ..
//   node compute-zenith.mjs --at <iso-8601 UTC> --lat <deg> --lon <deg> \
//        --catalog <your-catalog.json> --name "<label>"
//
// It writes this file for you. Right ascension and declination in the catalog may
// be spelled ra_degrees/dec_degrees or ra/dec; HYG, Gaia DR3 and VizieR dumps work.
// Use a whole-sky catalog -- a sampled one yields the closest entry in the file,
// not the closest star in the sky, and the script warns when it looks too sparse.
//
// Verified against the same catalog: HIP 73476, 7.09 mag, 544 ly, 0.1543° from the
// zenith for 1955-04-18 06:15 UTC at 40.3573N 74.6672W.

var ZS_HIP      = "HIP 73476";  // catalog designation (Hipparcos)
var ZS_MAG      = 7.09;         // apparent magnitude
var ZS_DIST_DEG = 0.16;         // angular distance from the zenith, degrees
var ZS_CONST    = "Boötes";     // constellation
