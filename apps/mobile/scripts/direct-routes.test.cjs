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
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const result = { exports: {} };
  new Function('require', 'exports', source)((name) =>
    load(path.resolve(path.dirname(resolved), `${name}.ts`)), result.exports);
  cache.set(resolved, result.exports);
  return result.exports;
}
const { findDirectRoutes } = load('features/routes/findDirectRoutes.ts');
const { resolveStop } = load('features/routes/resolveStop.ts');
const { sampleStops } = load('features/transport/data/sampleStops.ts');
const { sampleOperators } = load('features/transport/data/sampleOperators.ts');
const { sampleRoutes } = load('features/transport/data/sampleRoutes.ts');

// Additional stop sequences below are fictional unit-test inputs, not actual services.
const stops = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `Test stop ${id}`, type: 'bus_stop' }));
const operators = [{ id: 'test-operator', name: 'Fictional test operator', vehicleTypes: ['bus'] }];
const route = { id: 'test-route', name: 'Fictional test route', operatorId: 'test-operator', vehicleType: 'bus', stopIds: ['a', 'b', 'c', 'd'] };
const find = (origin, destination, routes = [route], stopRecords = stops, operatorRecords = operators) =>
  findDirectRoutes(origin, destination, routes, stopRecords, operatorRecords);

test('existing sample route resolves valid origin, destination, operator, and provenance', () => {
  const result = findDirectRoutes('sample-stop-bayan-terminal', 'sample-stop-palengke', sampleRoutes, sampleStops, sampleOperators);
  assert.equal(result.length, 1);
  assert.equal(result[0].routeId, 'sample-route-bayan-palengke');
  assert.equal(result[0].routeName, sampleRoutes[0].name);
  assert.equal(result[0].operator.name, sampleOperators[0].name);
  assert.equal(result[0].vehicleType, 'bus');
  assert.deepEqual(result[0].source, sampleRoutes[0].source);
  assert.equal(result[0].origin.id, 'sample-stop-bayan-terminal');
  assert.equal(result[0].destination.id, 'sample-stop-palengke');
});

test('results contain only the correctly ordered inclusive journey segment', () => {
  assert.deepEqual(find('b', 'd')[0].stops.map((stop) => stop.id), ['b', 'c', 'd']);
  assert.deepEqual(find('a', 'c')[0].stops.map((stop) => stop.id), ['a', 'b', 'c']);
});

test('reverse-direction journeys never automatically match', () => {
  assert.deepEqual(find('d', 'a'), []);
  assert.equal(find('d', 'a', [{ ...route, stopIds: ['d', 'c', 'b', 'a'] }]).length, 1);
});

test('unknown IDs, display names, and stops not sharing a route return no match', () => {
  assert.deepEqual(find('missing', 'b'), []);
  assert.deepEqual(find('a', 'missing'), []);
  assert.deepEqual(find('Test stop a', 'b'), []);
  assert.deepEqual(find('a', 'd', [{ ...route, stopIds: ['a', 'b'] }]), []);
});

test('all matching routes are returned in input order', () => {
  const second = { ...route, id: 'test-second', stopIds: ['a', 'c', 'd'] };
  assert.deepEqual(find('a', 'd', [second, route]).map((item) => item.routeId), ['test-second', 'test-route']);
});

test('same origin and destination and empty IDs do not produce travel routes', () => {
  assert.deepEqual(find('a', 'a'), []);
  assert.deepEqual(find('', 'd'), []);
});

test('invalid stop references invalidate the whole route, including outside the journey segment', () => {
  assert.deepEqual(find('b', 'c', [{ ...route, stopIds: ['missing', 'b', 'c'] }]), []);
  assert.deepEqual(find('a', 'b', [{ ...route, stopIds: ['a', 'b', 'missing'] }]), []);
  assert.deepEqual(find('a', 'd', [route], stops.map((stop) => stop.id === 'b' ? { ...stop, type: 'invalid' } : stop)), []);
});

test('missing or incompatible operators prevent misleading results', () => {
  assert.deepEqual(find('a', 'd', [{ ...route, operatorId: 'missing' }]), []);
  assert.deepEqual(find('a', 'd', [route], stops, [{ ...operators[0], vehicleTypes: ['train'] }]), []);
  assert.deepEqual(find('a', 'd', [route], stops, [{ ...operators[0], name: '' }]), []);
});

test('identical duplicate route records collapse to a single result', () => {
  assert.equal(find('a', 'd', [route, { ...route }]).length, 1);
});

test('conflicting route IDs or ambiguous stop/operator IDs are excluded', () => {
  assert.deepEqual(find('a', 'd', [route, { ...route, name: 'Conflicting fixture' }]), []);
  assert.deepEqual(find('a', 'd', [route], [...stops, stops[0]]), []);
  assert.deepEqual(find('a', 'd', [route], stops, [...operators, operators[0]]), []);
});

test('repeated stops and malformed sequences are not interpreted as loop services', () => {
  for (const stopIds of [['a', 'b', 'a', 'd'], ['a'], null]) {
    assert.deepEqual(find('a', 'd', [{ ...route, stopIds }]), []);
  }
});

test('results are deterministic and inputs remain unchanged', () => {
  const before = JSON.stringify([route, stops, operators]);
  assert.deepEqual(find('a', 'd'), find('a', 'd'));
  assert.equal(JSON.stringify([route, stops, operators]), before);
});

test('name resolution trims case-insensitively, preferring exact names over partial matches', () => {
  assert.equal(resolveStop(' SAMPLE BAYAN TERMINAL ', sampleStops).stop.id, 'sample-stop-bayan-terminal');
  assert.equal(resolveStop('Palengke', sampleStops).stop.id, 'sample-stop-palengke');
  const records = [...stops, { ...stops[1], id: 'long-name', name: 'Test stop a extended' }];
  assert.equal(resolveStop('Test stop a', records).stop.id, 'a');
});

test('missing, empty, partial-ambiguous, and duplicate-name inputs never choose arbitrarily', () => {
  assert.equal(resolveStop('PITX', sampleStops).status, 'missing');
  assert.equal(resolveStop(' ', sampleStops).status, 'missing');
  assert.equal(resolveStop('Station', sampleStops).status, 'ambiguous');
  assert.equal(resolveStop('Test stop a', [...stops, { ...stops[0], id: 'duplicate-name' }]).status, 'ambiguous');
});
