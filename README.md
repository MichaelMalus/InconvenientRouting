# Inconvenient Routing

The least direct way across London. Pick a start and end anywhere within the M25 plus 10 miles, and get a walking
route that strays past as many landmarks, parks, museums, theatres and historic sites as fit — or, with only pubs
ticked, a pub crawl.

**Live:** https://michaelmalus.github.io/InconvenientRouting/

## What it does

- **Start and end:** search by place name or UK postcode, or click the map. Leave out the end for a loop.
- **Plan by distance** (defaults to 1.5× the crow-flies distance) to fit in the most notable stops, or
  **by number of stops** to visit that many by the shortest way.
- **Stop types:** landmarks, historic sites, museums, theatres, parks, places of worship, viewpoints, pubs.
  *Variety* and *Another one* reshuffle.
- **Stops tab:** each stop with a Wikipedia photo and one-line description; click a section to see it on the map.
- **Itinerary page:** the same as a full-page walk-through with a small map of every section.
- **Share, export:** the address bar always holds a link to the current route. Open it in Google Maps
  (first 23 stops) or download a GPX file for a walking app.

## How it works

Everything is static files: no server, no build step. The route planner (`js/route.js`) is a greedy insertion
heuristic for the orienteering problem, polished with 2-opt, using crow-flies distances. The chosen stops are then
sent to a walking router for the real path; if that runs long, the least worthwhile stops are dropped until it fits.

| Path | What it is |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | The app |
| `js/route.js` | Route planning |
| `js/wiki.js` | Photos and descriptions from Wikipedia / Wikidata |
| `data/pois.js` | ~13.8k places from OpenStreetMap, scored for notability (generated) |
| `tools/build-data.mjs` | Regenerates `data/pois.js` from the Overpass API: `node tools/build-data.mjs` |

Rebuilding the data changes place positions in the file, so share links made before then plan a fresh route
with the same settings instead of showing the same stops.

## Run locally

Serve the folder, e.g. `npx http-server`, and open http://localhost:8080. (Opening `index.html` straight from disk is untested;
serving it is how it has been tested.)

## Online services used

All free and keyless; please be gentle with them.

- Map tiles: [CARTO](https://carto.com/attributions) basemaps, from OpenStreetMap data
- Walking routes: [FOSSGIS OSRM](https://routing.openstreetmap.de/) (results are cached in the browser)
- Photos and descriptions: Wikipedia, Wikidata, Wikimedia Commons
- Postcodes: [postcodes.io](https://postcodes.io/)

Untick *Follow real footpaths* to plan without the router (straight lines, estimated distances).

## Licence

Code: MIT. Place data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
