// Historical Sky -- configuration
// Edit this file, then run historical_sky.ssc (press F12 in Stellarium).
//
// SKY_DATE is in UTC. "Local" times are ambiguous here: Stellarium gives a custom
// observer location its own time zone (often local mean time, which for this location
// is UTC+7:45:38 rather than UTC+8), so a local 19:30 can land ~15 minutes off. UTC has
// no such ambiguity. 14:00 UTC = 22:00 China Standard Time (UTC+8).

var SKY_DATE = "2026-08-28T14:00:00";  // YYYY-MM-DDTHH:MM:SS, UTC
var SKY_LON  = 116.4074;               // longitude, east positive
var SKY_LAT  = 39.9042;                // latitude, north positive
var SKY_ALT  = 50;                     // altitude above sea level, metres
var SKY_NAME = "Beijing, China";       // label shown in Stellarium
