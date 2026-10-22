# Border Randomizer

Interactive world map in a **single HTML file** (`index.html`). It starts with the real political map; **Generate New Borders** redraws the planet with brand-new countries, each with a **new name, estimated population and capital**. A slider sets the granularity (3–250 countries). English by default, Spanish via the language button (or `?lang=es`).

## Run locally

Needs an internet connection (D3, map data and satellite imagery come from CDNs).

```bash
# Option 1: double-click index.html (works from file://)
# Option 2: local server
python3 -m http.server 8000      # or: npm start
# → http://localhost:8000
```

## Tests

Node ≥ 18, no dependencies.

```bash
npm test                                   # or: node --test
NE_DATA_DIR=/path/to/geojson npm test      # adds the real-data tests
```

`NE_DATA_DIR` must contain `ne_110m_admin_0_countries.geojson` and `ne_50m_populated_places_simple.geojson`. Tests extract the `Core` module from `index.html` (between `@@LOGIC-START` and `@@LOGIC-END`), so they exercise the exact code the browser runs: geometry, data validation, deterministic math, generation (conservation, size dissimilarity, Antarctica), capitals, per-country top cities, border tracing, names, share codes, network fallbacks.

## Using it

- **Generate New Borders**: new random seed → new borders, names, capitals.
- **Granularity**: log scale 3–250; redraws the current map with the same seed.
- **Capital rule**: most populous · most central · random among the top 3.
- **Hover**: the country under the cursor is highlighted (vivid fill, dark+white outline) and every other country is dimmed, on both the standard and satellite map.
- **Satellite**: NASA GIBS Blue Marble imagery under the semi-transparent countries.
- **Top 5 cities**: select a country (map or list) to see its five biggest cities, also marked on the map; fewer if it has fewer. Works for real and generated countries.
- **Share**: copies a link (`?n=40&seed=123456&cap=populous`) or opens the native share sheet. The same link always rebuilds the same map. From `file://` a link would be useless, so a code like `40-123456-p` is copied instead; paste it into the **Seed** box and press Enter. After loading a shared map, the next click on Generate New Borders makes a new one.
- **Seed box**: a number gives a reproducible map; a share code sets count, seed and capital rule.
- **Real world**: back to the original map. Wheel/drag to zoom and pan.

## Structure (all in `index.html`)

| Section | Responsibility |
|---|---|
| `Core` · RNG, deterministic math | seeded PRNG; `dexp/dlog/dsin/dcos/dpow/gauss` built from + − × ÷ √ only, so a seed gives the same map in every browser |
| `Core` · geometry, data | even-odd point-in-polygon, projection, GeoJSON normalisation/validation |
| `Core.buildWorld` | 0.5° land grid with population spread by cell area |
| `Core.pickSeeds` / `growRegions` / `generate` | seeds, competitive growth with random size, elongation and roughness |
| `Core.traceRegions` | grid → smoothed border polygons |
| `Core.assignCapitals`, `citiesIn`, `locate` | capitals and per-country city lists |
| `Core.generateNames` | pronounceable names derived from the territory |
| `Core.makeShareCode` / `parseShareCode` | share codes |
| App | SVG + D3 (zoom only), controls, panels, i18n |

## Method

1. **Land model:** a 0.5° grid; a cell is land if its centre falls in a Natural Earth country. Each country's `POP_EST` is spread by cell area. Antarctica is excluded and always drawn as is.
2. **Seeds:** N land points, best of 3 candidates by spacing.
3. **Growth:** seeds expand at the same time (multi-source Dijkstra) over a noisy cost field. Each seed has a log-normal target size (a few giants, many small countries, largest capped at about 12 % of land), its own elongation direction and roughness, so shapes are random rather than Voronoi-like.
4. **Borders:** traced from the grid, merged and smoothed (Chaikin), clipped to the coast.
5. **Population:** sum of the cells each new country covers (world total conserved). Area is the sum of cell areas.
6. **Capitals:** Natural Earth populated places; if a territory has none, the nearest unused city, marked `*`.
7. **Names:** head of the main contributing country's name plus tail of the second (when ≥ 12 % of the area), or head + an ending by continent; checked against pronounceability rules and unique, never equal to a real name or to the previous generation.

## Data sources

- Borders and population: [Natural Earth](https://www.naturalearthdata.com/) 110m `admin_0_countries` (public domain).
- Cities: Natural Earth 50m `populated_places_simple`.
- Served from `cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2` with a `raw.githubusercontent.com` fallback. D3 7.9.0 from jsDelivr with unpkg fallback.
- Satellite: NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` (WMS, EPSG:4326).

## Error handling

- D3 or border data failing to load: banner with technical detail and **Retry**; controls stay disabled.
- Only the cities file failing: the map works, capitals show "—" and per-country city lists are empty.
- Satellite failing: warning banner, the standard map keeps working.
- Invalid seed or share code: warning with the expected format.
- Each download has a 20 s timeout, format validation and a fallback URL.

## Known limitations

- Population is uniform inside each original country, so a border cutting a country in half assigns half of its people even if they live on one side. Rough estimate.
- 110m resolution: tiny countries get a single representative cell; coastlines are simplified.
- The grid is lon/lat, so regions near the poles are stretched compared with a true spherical partition.
- With more territories than cities, some capitals stay empty ("—").
- Names are pronounceable but not checked against real place names.
- The UI, hover highlight and the NASA GIBS satellite layer could not be checked in a real browser in the build environment (no browser, outbound proxy blocked GIBS). Logic is tested in Node with real data; please open `index.html` once to confirm the visuals.
- Share links work only when the page is hosted; the same seed gives the same map only for the same data version.
