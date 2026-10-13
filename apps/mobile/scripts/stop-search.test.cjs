const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src/features/transport');
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

const { searchStops } = load('searchStops.ts');
const { sampleStops } = load('data/sampleStops.ts');
const ids = (stops) => stops.map((stop) => stop.id);

test('names match without case sensitivity', () => {
  assert.deepEqual(ids(searchStops('sAmPlE bAyAn', sampleStops)), ['sample-stop-bayan-terminal']);
});

test('partial names match in source order', () => {
  assert.deepEqual(ids(searchStops('station', sampleStops)), [
    'sample-stop-silangan-station', 'sample-stop-kanluran-station',
  ]);
});

test('leading and trailing query whitespace is ignored', () => {
  assert.deepEqual(searchStops(' \tPlaza\n ', sampleStops), searchStops('Plaza', sampleStops));
});

test('addresses match partially and case-insensitively when present', () => {
  const fixture = [{ ...sampleStops[0], address: 'Fictional Market Entrance' }, sampleStops[1]];
  assert.deepEqual(ids(searchStops(' MARKET ', fixture)), ['sample-stop-bayan-terminal']);
  assert.deepEqual(searchStops('market', sampleStops), []);
});

test('empty and whitespace-only queries return all stops in source order', () => {
  assert.deepEqual(searchStops('', sampleStops), sampleStops);
  assert.deepEqual(searchStops(' \t\n ', sampleStops), sampleStops);
  assert.deepEqual(searchStops('', []), []);
});

test('unmatched queries return an empty collection', () => {
  assert.deepEqual(searchStops('no-such-place', sampleStops), []);
});

test('an empty query honors each supported stop-type filter', () => {
  for (const type of ['bus_stop', 'jeepney_stop', 'train_station', 'transport_terminal']) {
    assert.deepEqual(searchStops('', sampleStops, type), sampleStops.filter((stop) => stop.type === type));
  }
});

test('query and stop-type filter must both match', () => {
  assert.deepEqual(ids(searchStops('Bayan', sampleStops, 'transport_terminal')), ['sample-stop-bayan-terminal']);
  assert.deepEqual(searchStops('Bayan', sampleStops, 'bus_stop'), []);
});

test('search does not mutate the query collection or reorder its records', () => {
  const input = Object.freeze([...sampleStops]);
  const before = JSON.stringify(input);
  const result = searchStops('', input);
  assert.notEqual(result, input);
  result.reverse();
  assert.equal(JSON.stringify(input), before);
});
