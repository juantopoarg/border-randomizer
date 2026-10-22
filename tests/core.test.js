'use strict';
// Run with:  node --test      (Node >= 18, no dependencies)
// NE_DATA_DIR=/path/to/geojson node --test   adds the real-data integration tests.
// The tests load the Core module straight from index.html (between the @@LOGIC markers).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* @@LOGIC-START \*\/([\s\S]*?)\/\* @@LOGIC-END \*\//);
assert.ok(m, 'logic block not found in index.html');
const Core = new Function(m[1] + '\nreturn Core;')();

/* ---------- Synthetic fixture ---------- */
const rect = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const feat = (name, a3, pop, continent, geometry) => ({
  type: 'Feature', geometry, properties: { NAME: name, NAME_EN: name, NAME_ES: name, ADM0_A3: a3, POP_EST: pop, CONTINENT: continent },
});
const city = (name, lon, lat, pop, cap, a3) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name, adm0cap: cap ? 1 : 0, adm0_a3: a3, pop_max: pop },
});
const COUNTRIES_FC = { type: 'FeatureCollection', features: [
  feat('Norlandia', 'NOR', 80e6, 'Europe', rect(-10, 35, 30, 70)),
  feat('Sudavia', 'SUD', 200e6, 'Africa', rect(-15, -30, 45, 30)),
  feat('Orientia', 'ORI', 900e6, 'Asia', rect(60, -10, 180, 60)),
  feat('Occidentia', 'OCC', 120e6, 'North America', rect(-180, 10, -100, 60)),
  feat('Islote', 'ISL', 5000, 'Oceania', rect(150, -40, 150.2, -39.8)),
  feat('Antarctica', 'ATA', 1000, 'Antarctica', rect(-180, -90, 180, -70)),
] };
const CITIES_FC = { type: 'FeatureCollection', features: [
  city('Norburgo', 10, 50, 5e6, true, 'NOR'), city('Fjordal', 25, 65, 8e5, false, 'NOR'),
  city('Sudara', 20, 0, 9e6, true, 'SUD'), city('Kimbe', -5, -20, 3e6, false, 'SUD'), city('Zuluma', 35, -25, 2e6, false, 'SUD'),
  city('Orienta', 120, 30, 15e6, true, 'ORI'), city('Tamaki', 170, 5, 1e6, false, 'ORI'), city('Piru', 90, 50, 5e5, false, 'ORI'),
  city('Rio1', 100, 10, 4e5, false, 'ORI'), city('Rio2', 110, 15, 3e5, false, 'ORI'), city('Rio3', 130, 40, 2e5, false, 'ORI'),
  city('Occiden', -140, 40, 4e6, true, 'OCC'), city('Westport', -170, 20, 7e5, false, 'OCC'),
] };
const countries = Core.normalizeCountries(COUNTRIES_FC);
const cities = Core.normalizeCities(CITIES_FC);
const world = Core.buildWorld({ countries, cities, step: 1 });
const idOf = (a3) => countries.find((c) => c.a3 === a3).id;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const regular = (g) => g.cells.filter((c) => !c.fixed);

/* ---------- Geometry ---------- */
test('geometry: point in polygon with hole (even-odd)', () => {
  const poly = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]] };
  assert.equal(Core.geometryContains(poly, 2, 2), true);
  assert.equal(Core.geometryContains(poly, 5, 5), false);
  assert.equal(Core.geometryContains(poly, 20, 5), false);
});
test('geometry: bbox, representative point, SVG path, projection', () => {
  const g = rect(10, 20, 30, 40);
  assert.deepEqual(Core.geometryBBox(g), [10, 20, 30, 40]);
  assert.ok(Core.geometryContains(g, ...Core.representativePoint(g)));
  assert.match(Core.geometryToPath(g, 1000, 500), /^M.*Z$/);
  assert.deepEqual(Core.lonLatToXY(-180, 90, 1000, 500), [0, 0]);
  assert.deepEqual(Core.lonLatToXY(180, -90, 1000, 500), [1000, 500]);
});
test('granularity: monotonic, 3–250, invertible', () => {
  assert.equal(Core.granularityToCount(0), 3);
  assert.equal(Core.granularityToCount(100), 250);
  let prev = 0;
  for (let v = 0; v <= 100; v += 5) { const n = Core.granularityToCount(v); assert.ok(n >= prev); prev = n; }
  for (const n of [3, 20, 60, 250]) assert.ok(Math.abs(Core.granularityToCount(Core.countToGranularity(n)) - n) <= Math.max(1, n * 0.05));
});

/* ---------- Determinism ---------- */
test('PRNG: same seed, same sequence; different seed differs', () => {
  const a = Core.mulberry32(7), b = Core.mulberry32(7), c = Core.mulberry32(8);
  const sa = [a(), a(), a()];
  assert.deepEqual(sa, [b(), b(), b()]);
  assert.notDeepEqual(sa, [c(), c(), c()]);
});
test('deterministic math: dexp/dlog/dsin/dcos/dpow close to Math.*', () => {
  for (const x of [-3, -0.7, 0, 0.3, 1, 2.5, 6]) assert.ok(Math.abs(Core.dexp(x) / Math.exp(x) - 1) < 1e-9, 'dexp ' + x);
  for (const x of [1e-4, 0.2, 1, 3, 77, 1e6]) assert.ok(Math.abs(Core.dlog(x) - Math.log(x)) < 1e-9, 'dlog ' + x);
  for (const x of [-7, -1, 0, 0.5, 2, 3.14, 10]) {
    assert.ok(Math.abs(Core.dsin(x) - Math.sin(x)) < 1e-9, 'dsin ' + x);
    assert.ok(Math.abs(Core.dcos(x) - Math.cos(x)) < 1e-9, 'dcos ' + x);
  }
  for (const x of [0.1, 1, 4, 20]) assert.ok(Math.abs(Core.dpow(x, 0.35) / Math.pow(x, 0.35) - 1) < 1e-9, 'dpow ' + x);
});
test('same seed → identical map; different seed → different map', () => {
  const a = Core.generate(world, { count: 6, seed: 42 }), b = Core.generate(world, { count: 6, seed: 42 }), c = Core.generate(world, { count: 6, seed: 43 });
  assert.deepEqual(Array.from(a.labels), Array.from(b.labels));
  assert.deepEqual(a.cells.map((x) => x.name), b.cells.map((x) => x.name));
  assert.notDeepEqual(Array.from(a.labels), Array.from(c.labels));
});

/* ---------- Share codes ---------- */
test('share code: round trip and validation', () => {
  const g = Core.generate(world, { count: 5, seed: 123456, capitalMode: 'central' });
  const code = Core.makeShareCode(g);
  assert.equal(code, '5-123456-c');
  assert.deepEqual(Core.parseShareCode(code), { count: 5, seed: 123456, capitalMode: 'central' });
  assert.equal(Core.parseShareCode('40-99').capitalMode, 'populous');
  for (const bad of ['', 'abc', '2-5-p', '999-5-p', '40-99999999999', '40-5-x']) assert.equal(Core.parseShareCode(bad), null, bad);
});

/* ---------- Data ---------- */
test('data: normalization and Antarctica detection', () => {
  assert.equal(countries.length, 6);
  assert.equal(cities.length, CITIES_FC.features.length);
  assert.ok(Core.isFixedTerritory(countries[idOf('ATA')]));
  assert.ok(!Core.isFixedTerritory(countries[idOf('NOR')]));
});
test('data: validation rejects unexpected formats with English messages', () => {
  assert.throws(() => Core.validateFeatureCollection(null, 'Borders', 1), /Borders: unexpected file format/);
  assert.throws(() => Core.validateFeatureCollection({ type: 'FeatureCollection', features: [] }, 'Cities', 5), /Cities/);
  assert.equal(Core.validateFeatureCollection(COUNTRIES_FC, 'x', 1), COUNTRIES_FC);
});

/* ---------- World model ---------- */
test('world: population is conserved over land cells', () => {
  const total = sum(Array.from(world.w));
  const expected = sum(countries.filter((c) => !Core.isFixedTerritory(c)).map((c) => c.pop));
  assert.ok(Math.abs(total / expected - 1) < 1e-6, total + ' vs ' + expected);
});
test('world: tiny countries still get a representative cell', () => {
  assert.ok(world.nPoints > 0);
  let found = false;
  for (let i = 0; i < world.nPoints; i++) if (world.cty[i] === idOf('ISL')) found = true;
  assert.ok(found);
});

/* ---------- Generation ---------- */
test('generation: requested count, every land node labeled, population and area conserved', () => {
  const g = Core.generate(world, { count: 7, seed: 5 });
  assert.equal(regular(g).length, 7);
  for (let i = 0; i < world.nPoints; i++) assert.ok(g.labels[world.nodeCell[i]] >= 0 && g.labels[world.nodeCell[i]] < 7);
  assert.ok(Math.abs(sum(regular(g).map((c) => c.pop)) / sum(Array.from(world.w)) - 1) < 1e-9);
  assert.ok(Math.abs(g.totalPop / sum(countries.map((c) => c.pop)) - 1) < 1e-6);
});
test('generation: Antarctica is kept intact and never receives a generated name', () => {
  const g = Core.generate(world, { count: 5, seed: 9 });
  const fx = g.cells.filter((c) => c.fixed);
  assert.equal(fx.length, 1);
  assert.equal(fx[0].name, 'Antarctica');
  assert.equal(fx[0].countryId, idOf('ATA'));
  assert.equal(fx[0].capital, null);
});
test('generation: count is clamped to available land', () => {
  const g = Core.generate(world, { count: 1e6, seed: 1 });
  assert.ok(regular(g).length <= world.nPoints && regular(g).length > 1);
});
test('generation: unique names, none equal to a real country, avoid-set honoured', () => {
  const real = new Set(countries.map((c) => c.name.toLowerCase()));
  const g = Core.generate(world, { count: 20, seed: 11 });
  const names = regular(g).map((c) => c.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  names.forEach((n) => assert.ok(!real.has(n)));
  const g2 = Core.generate(world, { count: 20, seed: 11, avoid: new Set(regular(g).map((c) => c.key)) });
  const keys = new Set(regular(g).map((c) => c.key));
  regular(g2).forEach((c) => assert.ok(!keys.has(c.key)));
});

/* ---------- Capitals ---------- */
test('capitals: populous picks the biggest city of the territory; unique; fallback flagged', () => {
  const g = Core.generate(world, { count: 3, seed: 3, capitalMode: 'populous' });
  const caps = regular(g).filter((c) => c.capital).map((c) => c.capital.name);
  assert.equal(new Set(caps).size, caps.length);
  for (const c of regular(g)) if (c.capital && !c.capital.fallback) {
    const inCell = Core.citiesIn(world, g, c.id, 99);
    assert.equal(inCell[0].name, c.capital.name);
  }
});
test('capitals: all three modes assign something', () => {
  for (const mode of ['populous', 'central', 'random']) {
    const g = Core.generate(world, { count: 4, seed: 8, capitalMode: mode });
    assert.ok(regular(g).some((c) => c.capital), mode);
  }
});

/* ---------- Top cities of a selected country ---------- */
test('citiesIn (real): only the selected country, sorted, limited to 5', () => {
  const ori = Core.citiesIn(world, null, idOf('ORI'), 5);
  assert.equal(ori.length, 5);
  assert.ok(ori.every((c, i) => i === 0 || ori[i - 1].pop >= c.pop));
  assert.equal(ori[0].name, 'Orienta');
  assert.ok(!ori.some((c) => c.name === 'Norburgo'));
});
test('citiesIn (real): fewer than 5 for a small country; empty if none', () => {
  assert.equal(Core.citiesIn(world, null, idOf('OCC'), 5).length, 2);
  assert.deepEqual(Core.citiesIn(world, null, idOf('ISL'), 5), []);
});
test('citiesIn (generated): cities inside the new country only; Antarctica empty', () => {
  const g = Core.generate(world, { count: 4, seed: 21 });
  let total = 0;
  for (const c of regular(g)) {
    const list = Core.citiesIn(world, g, c.id, 99);
    list.forEach((x) => assert.equal(Core.locate(world, g, x.lon, x.lat), c.id));
    assert.ok(list.length <= 99 && list.every((x, i) => i === 0 || list[i - 1].pop >= x.pop));
    total += list.length;
  }
  assert.ok(total >= 1 && total <= cities.length);
  assert.deepEqual(Core.citiesIn(world, g, g.cells.find((c) => c.fixed).id, 5), []);
});

/* ---------- Border tracing ---------- */
test('traceRegions: area equals the cell count, holes respected', () => {
  const nx = 8, ny = 6, lab = new Int16Array(nx * ny).fill(0);
  for (let j = 2; j < 4; j++) for (let i = 3; i < 5; i++) lab[j * nx + i] = 1;   // island region inside region 0
  const rings = Core.traceRegions(lab, nx, ny, 2, { smooth: 0, step: 1 });
  const area = (r) => Math.abs(r.reduce((s, p, k) => { const q = r[(k + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const signed = (r) => r.reduce((s, p, k) => { const q = r[(k + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  assert.equal(rings[1].length, 1);
  assert.ok(Math.abs(area(rings[1][0]) - 4) < 1e-9);
  assert.equal(rings[0].length, 2);                                  // outer ring + hole
  assert.ok(Math.abs(sum(rings[0].map(signed)) - Math.sign(signed(rings[0][0])) * 44) < 1e-9 || Math.abs(Math.abs(sum(rings[0].map(signed))) - 44) < 1e-9);   // outer 48 minus hole 4
});

/* ---------- Names ---------- */
test('names: pronounceability and plausibility checks', () => {
  for (const ok of ['Norlandia', 'Bolivia', 'Tanzar', 'Kivoria']) assert.ok(Core.isPronounceable(ok.toLowerCase()), ok);
  for (const bad of ['Arvklndxy', 'Bxqzt', 'Ttrrkkss', 'Qqq']) assert.ok(!Core.isPronounceable(bad.toLowerCase()), bad);
});
test('names: composition name derives from a contributing territory', () => {
  const g = Core.generate(world, { count: 3, seed: 2 });
  for (const c of regular(g)) {
    assert.ok(c.name.length >= 4 && c.name.length <= 14, c.name);
    assert.ok(Core.isPronounceable(c.name.toLowerCase()), c.name);
  }
});

/* ---------- Network ---------- */
test('network: falls back to the second URL, then reports every failure', async () => {
  const realFetch = global.fetch;
  global.fetch = async (u) => { if (u.includes('bad')) throw new Error('boom'); return { ok: true, status: 200, json: async () => ({ ok: u }) }; };
  try {
    const r = await Core.loadFirstAvailable(['https://bad/1', 'https://good/2'], { timeoutMs: 500 });
    assert.equal(r.data.ok, 'https://good/2');
    await assert.rejects(Core.loadFirstAvailable(['https://bad/1', 'https://bad/2'], { timeoutMs: 500 }), (e) => e.name === 'DataLoadError' && e.details.length === 2);
  } finally { global.fetch = realFetch; }
});
test('network: timeout aborts a hanging request', async () => {
  const realFetch = global.fetch;
  global.fetch = (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  try { await assert.rejects(Core.loadFirstAvailable(['https://slow/1'], { timeoutMs: 50 }), (e) => e.name === 'DataLoadError'); }
  finally { global.fetch = realFetch; }
});

/* ---------- Integration with real Natural Earth data ---------- */
const DIR = process.env.NE_DATA_DIR;
const real = DIR ? (() => {
  const c = Core.normalizeCountries(JSON.parse(fs.readFileSync(path.join(DIR, 'ne_110m_admin_0_countries.geojson'), 'utf8')));
  const p = Core.normalizeCities(JSON.parse(fs.readFileSync(path.join(DIR, 'ne_50m_populated_places_simple.geojson'), 'utf8')));
  return { c, p, w: Core.buildWorld({ countries: c, cities: p, step: 0.5 }) };
})() : null;
const itest = real ? test : test.skip;

itest('real data: population conserved and Antarctica fixed', () => {
  const g = Core.generate(real.w, { count: 40, seed: 7 });
  assert.equal(regular(g).length, 40);
  assert.equal(g.cells.filter((c) => c.fixed).length, 1);
  const world0 = sum(real.c.map((c) => c.pop));
  assert.ok(Math.abs(g.totalPop / world0 - 1) < 0.02, g.totalPop + ' vs ' + world0);
});
itest('real data: very dissimilar sizes, few giants, many small', () => {
  const g = Core.generate(real.w, { count: 40, seed: 7 });
  const a = regular(g).map((c) => c.areaKm2).sort((x, y) => y - x), tot = sum(a);
  assert.ok(a[0] / tot < 0.2, 'giant share ' + a[0] / tot);
  assert.ok(a[0] / a[a.length - 1] > 50, 'ratio ' + a[0] / a[a.length - 1]);
  assert.ok(a.filter((x) => x / tot > 0.08).length <= 3);
  assert.ok(a.filter((x) => x / tot < 0.01).length >= 8);
});
itest('real data: names pronounceable (all seeds sampled) and unique', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = Core.generate(real.w, { count: 60, seed });
    const names = regular(g).map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
    names.forEach((n) => assert.ok(Core.isPronounceable(n.toLowerCase()), n));
  }
});
itest('real data: argentine-like case — top cities for a real country belong to it', () => {
  const arg = real.c.find((c) => c.a3 === 'ARG');
  const top = Core.citiesIn(real.w, null, arg.id, 5);
  assert.equal(top.length, 5);
  top.forEach((c) => assert.equal(c.a3, 'ARG'));
});
itest('real data: shared code reproduces the same map', () => {
  const g1 = Core.generate(real.w, { count: 30, seed: 987654, capitalMode: 'random' });
  const sc = Core.parseShareCode(Core.makeShareCode(g1));
  const g2 = Core.generate(real.w, { count: sc.count, seed: sc.seed, capitalMode: sc.capitalMode });
  assert.deepEqual(Array.from(g1.labels), Array.from(g2.labels));
  assert.deepEqual(g1.cells.map((c) => [c.name, c.capital && c.capital.name]), g2.cells.map((c) => [c.name, c.capital && c.capital.name]));
});
