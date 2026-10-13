const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/features/transport/mapStops.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exportsObject = {};
new Function('exports', source)(exportsObject);
const { hasValidCoordinates, getMapStops, selectStopById, stopMapUrl, stopWalkingUrl } = exportsObject;
// Coordinates are synthetic boundary fixtures, never application transport data.
const stop = { id: 'test-stop', name: 'Synthetic stop', type: 'bus_stop', location: { latitude: 0, longitude: -1.25 } };

test('accepts finite numeric coordinates including zero and signed decimals', () => {
  assert.equal(hasValidCoordinates(stop.location), true);
});

test('rejects missing, malformed, nonnumeric, and nonfinite coordinates', () => {
  for (const value of [undefined, null, {}, '0,0', { latitude: 0 },
    { latitude: '0', longitude: 0 }, { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity }, { latitude: -Infinity, longitude: 0 }]) {
    assert.equal(hasValidCoordinates(value), false);
  }
});

test('accepts inclusive boundaries but rejects values outside them', () => {
  for (const latitude of [-90, 90]) for (const longitude of [-180, 180]) {
    assert.equal(hasValidCoordinates({ latitude, longitude }), true);
  }
  for (const latitude of [-90.001, 90.001]) assert.equal(hasValidCoordinates({ latitude, longitude: 0 }), false);
  for (const longitude of [-180.001, 180.001]) assert.equal(hasValidCoordinates({ latitude: 0, longitude }), false);
});

test('map stops omit missing and invalid coordinates and preserve source order', () => {
  const second = { ...stop, id: 'second' };
  const records = [stop, { ...stop, id: 'missing', location: undefined }, second,
    { ...stop, id: 'invalid', location: { latitude: 91, longitude: 0 } }];
  assert.deepEqual(getMapStops(records), [stop, second]);
  assert.equal(records.length, 4);
  assert.deepEqual(getMapStops([]), []);
});

test('identical duplicated records produce one location per stable ID', () => {
  assert.deepEqual(getMapStops([stop, { ...stop }, stop]), [stop]);
});

test('conflicting duplicated IDs are excluded even if followed by a repeated record', () => {
  const conflict = { ...stop, location: { latitude: 1, longitude: 1 } };
  assert.deepEqual(getMapStops([stop, conflict, stop]), []);
  assert.equal(selectStopById([stop, conflict], stop.id), undefined);
});

test('selection uses exact IDs rather than names, indexes, or partial matching', () => {
  const second = { ...stop, id: 'second', location: undefined };
  assert.equal(selectStopById([stop, second], 'second'), second);
  assert.equal(selectStopById([stop], stop.name), undefined);
  assert.equal(selectStopById([stop], 'test'), undefined);
  assert.equal(selectStopById([stop, { ...stop }], stop.id), stop);
});

test('map links encode the validated coordinate pair, never the name', () => {
  const url = stopMapUrl({ ...stop, name: 'Ignore &query=unsupported' });
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=0%2C-1.25');
  assert.equal(new URL(url).searchParams.get('query'), '0,-1.25');
});

test('walking links specify encoded destination and walking without an invented origin', () => {
  const url = stopWalkingUrl(stop);
  assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=0%2C-1.25&travelmode=walking');
  const params = new URL(url).searchParams;
  assert.equal(params.get('destination'), '0,-1.25');
  assert.equal(params.has('origin'), false);
  assert.equal(params.has('dir_action'), false);
});

test('missing and invalid locations never produce external URLs', () => {
  for (const location of [undefined, { latitude: 0, longitude: 181 }, { latitude: NaN, longitude: 0 }]) {
    assert.equal(stopMapUrl({ ...stop, location }), undefined);
    assert.equal(stopWalkingUrl({ ...stop, location }), undefined);
  }
});
