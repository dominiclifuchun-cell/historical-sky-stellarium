// Historical Sky -- configuration
// Edit this file, then run historical_sky.ssc (press F12 in Stellarium).
//
// SKY_DATE is in UTC. "Local" times are ambiguous here: Stellarium gives a custom
// observer location its own time zone, often local mean time. For this location that is
// UTC-4:58:40 rather than the UTC-5:00 the clocks actually showed in 1955, so a "local"
// reading can land over a minute off. UTC has no such ambiguity.
//
// The default is a documented moment: 1:15 a.m. on 18 April 1955, the hour Albert
// Einstein died at Princeton Hospital (time per The Daily Princetonian of that morning).
// 06:15 UTC = 01:15 Eastern Standard Time. Edit the five values below for any other
// date, time and place.

var SKY_DATE = "1955-04-18T06:15:00";        // YYYY-MM-DDTHH:MM:SS, UTC
var SKY_LON  = -74.6672;                     // longitude, east positive
var SKY_LAT  = 40.3573;                      // latitude, north positive
var SKY_ALT  = 30;                           // altitude above sea level, metres
var SKY_NAME = "Princeton, New Jersey, USA"; // label shown in Stellarium
