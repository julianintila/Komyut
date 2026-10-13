const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(filename) {
  const resolved = path.resolve(root, filename);
  if (cache.has(resolved)) return cache.get(resolved);
  const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const result = { exports: {} };
  new Function('require', 'exports', source)((name) =>
    load(path.resolve(path.dirname(resolved), `${name}.ts`)), result.exports);
  cache.set(resolved, result.exports);
  return result.exports;
}
const { findJourneys } = load('features/routes/findJourneys.ts');
const { findDirectRoutes } = load('features/routes/findDirectRoutes.ts');
const { sampleStops } = load('features/transport/data/sampleStops.ts');
const { sampleOperators } = load('features/transport/data/sampleOperators.ts');
const { sampleRoutes } = load('features/transport/data/sampleRoutes.ts');

// Everything below is fictional test data; monetary values are not official fares.
const stops = ['a', 'b', 'c', 'd', 'e', 'isolated'].map((id) => ({ id, name: `Test stop ${id}`, type: 'bus_stop' }));
const operators = [{ id: 'bus-op', name: 'Test bus operator', vehicleTypes: ['bus'] },
  { id: 'jeep-op', name: 'Test jeepney operator', vehicleTypes: ['jeepney'] }];
const route = (id, stopIds, vehicleType = 'bus') => ({
  id, name: `Test route ${id}`, stopIds, vehicleType,
  operatorId: vehicleType === 'bus' ? 'bus-op' : 'jeep-op',
});
const routes = [route('ab', ['a', 'b']), route('bc', ['b', 'c'], 'jeepney'), route('cd', ['c', 'd'])];
const plan = (origin, destination, options = {}, records = routes, stopRecords = stops) =>
  findJourneys(origin, destination, records, stopRecords, operators, options);
const fixed = (mode, amountCentavos) => ({
  id: `test-fare-${mode}`, name: 'Synthetic fare fixture', vehicleType: mode, currency: 'PHP',
  structure: { type: 'fixed', amountCentavos }, provenance: { reliability: 'unverified' },
});
const binding = (routeId, originStopId, destinationStopId, rule, extra = {}) => ({ routeId, originStopId, destinationStopId, rule, ...extra });
const fareInputs = [binding('ab', 'a', 'b', fixed('bus', 1001)), binding('bc', 'b', 'c', fixed('jeepney', 1002))];

test('direct journeys reuse the direct-route segment shape', () => {
  const records = [route('ac', ['a', 'b', 'c'])];
  const result = plan('a', 'c', {}, records)[0];
  const { fare, ...segment } = result.segments[0];
  assert.deepEqual(segment, findDirectRoutes('a', 'c', records, stops, operators)[0]);
  assert.equal(result.transferCount, 0);
  assert.deepEqual(result.transferStops, []);
});

test('one transfer uses the same stop ID and correctly directed boarding/alighting points', () => {
  const journey = plan('a', 'c')[0];
  assert.equal(journey.origin.id, 'a');
  assert.equal(journey.destination.id, 'c');
  assert.deepEqual(journey.segments.map((segment) => [segment.routeId, segment.origin.id, segment.destination.id]),
    [['ab', 'a', 'b'], ['bc', 'b', 'c']]);
  assert.deepEqual(journey.transferStops.map((stop) => stop.id), ['b']);
  assert.equal(journey.transferCount, 1);
});

test('multiple transfers are supported only within the configured segment limit', () => {
  assert.equal(plan('a', 'd')[0].transferCount, 2);
  assert.deepEqual(plan('a', 'd', { maxSegments: 2 }), []);
  const records = [...routes, route('de', ['d', 'e'])];
  assert.deepEqual(plan('a', 'e', {}, records), []);
  assert.equal(plan('a', 'e', { maxSegments: 4 }, records)[0].transferCount, 3);
  for (const maxSegments of [0, 7, NaN, 1.5, '3']) {
    assert.throws(() => plan('a', 'd', { maxSegments }), RangeError);
  }
});

test('unconnected, identical, missing, and reverse-direction stops have no journeys', () => {
  for (const [from, to] of [['a', 'isolated'], ['a', 'a'], ['missing', 'c'], ['c', 'a']]) {
    assert.deepEqual(plan(from, to), []);
  }
});

test('matching names or coordinates never substitute for shared transfer IDs', () => {
  const duplicatePlace = { id: 'other-b', name: stops[1].name, type: 'bus_stop', location: { latitude: 0, longitude: 0 } };
  const records = [routes[0], route('other-c', ['other-b', 'c'])];
  assert.deepEqual(plan('a', 'c', {}, records, [...stops, duplicatePlace]), []);
});

test('invalid routes, operator references, and repeated stops retain Brick 10 rejection rules', () => {
  for (const invalid of [
    route('bad', ['b', 'missing', 'c']), { ...routes[1], operatorId: 'missing' },
    route('bad', ['b', 'a', 'b', 'c']),
  ]) assert.deepEqual(plan('a', 'c', {}, [routes[0], invalid]), []);
});

test('cycles, repeated routes, and revisited intermediate stops are excluded', () => {
  const records = [...routes, route('back', ['b', 'a'])];
  const result = plan('a', 'd', { maxSegments: 6 }, records);
  assert.equal(result.length, 1);
  const ids = result[0].segments.flatMap((segment, index) => segment.stops.slice(index ? 1 : 0).map((stop) => stop.id));
  assert.equal(new Set(ids).size, ids.length);
  const overlap = [route('abc', ['a', 'b', 'c']), route('cbd', ['c', 'b', 'd'])];
  const paths = plan('a', 'd', {}, overlap);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].transferStops[0].id, 'b');
  assert.equal(plan('a', 'c', { maxSegments: 6 }, [route('abc', ['a', 'b', 'c'])]).length, 1);
});

test('duplicate journeys are suppressed and fewer transfers sort first deterministically', () => {
  const direct = route('ad', ['a', 'd']);
  const records = [...routes, direct, { ...routes[0] }];
  const paths = plan('a', 'd', {}, records);
  assert.deepEqual(paths.map((journey) => journey.transferCount), [0, 2]);
  assert.deepEqual(plan('a', 'd', {}, records), paths);
});

test('fully configured segment fares sum in integer centavos with provenance retained', () => {
  const journey = plan('a', 'c', { fareInputs })[0];
  assert.deepEqual(journey.fareEstimate, { status: 'complete', currency: 'PHP', totalCentavos: 2003, reliability: 'unverified' });
  assert.equal(journey.segments[0].fare.result.amountCentavos, 1001);
  assert.deepEqual(journey.segments[0].fare.result.provenance, fareInputs[0].rule.provenance);
});

test('missing fares are unknown or incomplete, never represented as a complete partial sum', () => {
  assert.equal(plan('a', 'c')[0].fareEstimate.status, 'unknown');
  const journey = plan('a', 'c', { fareInputs: [fareInputs[0]] })[0];
  assert.deepEqual(journey.fareEstimate, { status: 'incomplete', knownSegmentCount: 1, segmentCount: 2 });
  assert.equal(journey.fareEstimate.totalCentavos, undefined);
  assert.deepEqual(journey.segments[1].fare, { status: 'unknown', reason: 'missing_rule' });
});

test('invalid, unconfigured, and mismatched segment rules prevent complete totals', () => {
  for (const rule of [fixed('jeepney', -1), { ...fixed('jeepney', 0), structure: { type: 'unconfigured' } }, fixed('bus', 1)]) {
    const journey = plan('a', 'c', { fareInputs: [fareInputs[0], { ...fareInputs[1], rule }] })[0];
    assert.equal(journey.fareEstimate.status, 'incomplete');
    assert.equal(journey.fareEstimate.totalCentavos, undefined);
  }
});

test('ambiguous rule assignments and full-route-only assignments never guess segment fares', () => {
  const journey = plan('a', 'c', { fareInputs: [...fareInputs, fareInputs[0]] })[0];
  assert.deepEqual(journey.segments[0].fare, { status: 'unknown', reason: 'ambiguous_rule' });
  const result = plan('b', 'c', { fareInputs: [binding('abc', 'a', 'c', fixed('bus', 1))] }, [route('abc', ['a', 'b', 'c'])])[0];
  assert.equal(result.fareEstimate.status, 'unknown');
});

test('distance fares require explicit segment distances and use the existing calculator', () => {
  const distance = { ...fixed('jeepney', 0), structure: {
    type: 'distance_based', baseFareCentavos: 300, includedDistanceKm: 1,
    increment: { distanceKm: 1, amountCentavos: 50, rounding: 'up' },
  } };
  const inputs = [fareInputs[0], { ...fareInputs[1], rule: distance }];
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.status, 'incomplete');
  inputs[1].distanceKm = 1.5;
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.totalCentavos, 1351);
});

test('station-pair fares receive the exact segment boarding and alighting IDs', () => {
  const stationRule = { ...fixed('jeepney', 0), structure: { type: 'station_pair', fares: [
    { originStopId: 'b', destinationStopId: 'c', amountCentavos: 2345 },
  ] } };
  assert.equal(plan('a', 'c', { fareInputs: [fareInputs[0], { ...fareInputs[1], rule: stationRule }] })[0].fareEstimate.totalCentavos, 3346);
});

test('total overflow is explicit, while safe large sums and configured zero remain exact', () => {
  const inputs = [
    { ...fareInputs[0], rule: fixed('bus', Number.MAX_SAFE_INTEGER) },
    { ...fareInputs[1], rule: fixed('jeepney', 1) },
  ];
  assert.deepEqual(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate, { status: 'unknown', reason: 'total_overflow' });
  inputs[0].rule = fixed('bus', Number.MAX_SAFE_INTEGER - 1);
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.totalCentavos, Number.MAX_SAFE_INTEGER);
  inputs[0].rule = fixed('bus', 0);
  inputs[1].rule = fixed('jeepney', 0);
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.totalCentavos, 0);
});

test('only explicitly supplied eligible segment discounts apply; transfers grant no discount', () => {
  // Simulated verified metadata exists only to exercise the calculator's trusted-policy branch.
  const policy = { id: 'test-policy', name: 'Synthetic policy', rateBasisPoints: 5000, rounding: 'nearest',
    conditions: { vehicleTypes: ['bus'] }, provenance: { reliability: 'verified',
      source: { sourceName: 'Simulated test verification, not official', verifiedOn: '2024-01-01' } } };
  const inputs = [{ ...fareInputs[0], discount: { policy, eligible: true } }, fareInputs[1]];
  const journey = plan('a', 'c', { fareInputs: inputs })[0];
  assert.equal(journey.fareEstimate.totalCentavos, 1503);
  assert.equal(journey.segments[0].fare.result.status, 'discounted');
  assert.equal(journey.segments[1].fare.result.status, 'regular');
  inputs[0].discount.eligible = false;
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.totalCentavos, 2003);
  delete inputs[0].discount.eligible;
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.totalCentavos, 2003);
});

test('existing fictional samples support Plaza-to-Palengke transfer with unknown fare', () => {
  const paths = findJourneys('sample-stop-plaza', 'sample-stop-palengke', sampleRoutes, sampleStops, sampleOperators);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].transferStops[0].id, 'sample-stop-bayan-terminal');
  assert.equal(paths[0].fareEstimate.status, 'unknown');
});

test('journey planning does not mutate supplied records or options', () => {
  const options = { fareInputs };
  const before = JSON.stringify([routes, stops, operators, options]);
  plan('a', 'c', options);
  assert.equal(JSON.stringify([routes, stops, operators, options]), before);
});

test('total reliability preserves the weakest segment provenance', () => {
  const verified = { reliability: 'verified', source: { sourceName: 'Simulated unit-test provenance', verifiedOn: '2024-01-01' } };
  const inputs = fareInputs.map((input) => ({ ...input, rule: { ...input.rule, provenance: verified } }));
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.reliability, 'verified');
  inputs[0].rule.provenance = { reliability: 'estimated' };
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.reliability, 'estimated');
  inputs[1].rule.provenance = { reliability: 'unverified' };
  assert.equal(plan('a', 'c', { fareInputs: inputs })[0].fareEstimate.reliability, 'unverified');
});

test('effective-dated rules require the explicitly supplied segment date', () => {
  const dated = { ...fareInputs[0], rule: { ...fareInputs[0].rule, effectiveFrom: '2024-01-01', effectiveUntil: '2024-01-31' } };
  assert.equal(plan('a', 'c', { fareInputs: [dated, fareInputs[1]] })[0].fareEstimate.status, 'incomplete');
  dated.date = '2024-01-01';
  assert.equal(plan('a', 'c', { fareInputs: [dated, fareInputs[1]] })[0].fareEstimate.totalCentavos, 2003);
});
