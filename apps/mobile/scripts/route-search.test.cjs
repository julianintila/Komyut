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
const { initialRouteSearchForm, routeSearchFormReducer: reduce } = load('screens/routeSearchForm.ts');
const { sampleStops } = load('features/transport/data/sampleStops.ts');
const { sampleOperators } = load('features/transport/data/sampleOperators.ts');
const { sampleRoutes } = load('features/transport/data/sampleRoutes.ts');
const dataset = { stops: sampleStops, operators: sampleOperators, routes: sampleRoutes };

function submit(origin, destination) {
  return reduce({ ...initialRouteSearchForm, origin, destination }, { type: 'submit', dataset });
}

test('empty origin and destination identify both missing fields', () => {
  assert.deepEqual(submit('', '').feedback, {
    kind: 'error',
    message: 'Enter a starting location in From and a destination in To.',
  });
});

test('missing origin identifies From', () => {
  assert.deepEqual(submit('', 'PITX').feedback, {
    kind: 'error', message: 'Enter a starting location in From.',
  });
});

test('missing destination identifies To', () => {
  assert.deepEqual(submit('GMA, Cavite', '').feedback, {
    kind: 'error', message: 'Enter a destination in To.',
  });
});

test('whitespace-only locations count as missing', () => {
  assert.equal(submit(' \t ', '\n ').feedback.kind, 'error');
  assert.equal(submit(' ', 'PITX').feedback.message, 'Enter a starting location in From.');
  assert.equal(submit('GMA, Cavite', ' ').feedback.message, 'Enter a destination in To.');
});

test('swapping exchanges entered values and clears old feedback', () => {
  const state = submit('GMA, Cavite', 'PITX');
  assert.deepEqual(reduce(state, { type: 'swap' }), {
    origin: 'PITX', destination: 'GMA, Cavite', feedback: null, journeys: [],
  });
  assert.equal(state.origin, 'GMA, Cavite');
  assert.equal(state.destination, 'PITX');
});

test('swapping works when a location is empty', () => {
  assert.deepEqual(reduce(submit('', 'PITX'), { type: 'swap' }), {
    origin: 'PITX', destination: '', feedback: null, journeys: [],
  });
});

test('uniquely resolved names produce direct sample routes, never fares', () => {
  const state = submit(' Sample Bayan Terminal ', ' Sample Palengke Bus Stop ');
  assert.deepEqual(state.feedback, {
    kind: 'results',
    message: '1 sample journey found.',
  });
  assert.equal(state.journeys[0].segments[0].routeId, 'sample-route-bayan-palengke');
  assert.equal(state.journeys[0].fareEstimate.status, 'unknown');
  assert.equal(state.origin, ' Sample Bayan Terminal ');
  assert.equal(state.destination, ' Sample Palengke Bus Stop ');
  assert.equal(state.fares, undefined);
});

test('editing either location updates only that field and clears stale feedback', () => {
  const state = submit('GMA, Cavite', 'PITX');
  assert.deepEqual(reduce(state, { type: 'edit', field: 'origin', value: 'Manila' }), {
    origin: 'Manila', destination: 'PITX', feedback: null, journeys: [],
  });
  assert.deepEqual(reduce(state, { type: 'edit', field: 'destination', value: '' }), {
    origin: 'GMA, Cavite', destination: '', feedback: null, journeys: [],
  });
});

test('missing and ambiguous stop names ask for a valid selection', () => {
  assert.match(submit('GMA, Cavite', 'Palengke').feedback.message, /No sample stop matches From/);
  assert.match(submit('Bayan', 'PITX').feedback.message, /No sample stop matches To/);
  assert.match(submit('Sample', 'Palengke').feedback.message, /From matches several/);
  assert.match(submit('Bayan', 'Station').feedback.message, /To matches several/);
});

test('same-stop and reverse-direction journeys are explicit and contain no results', () => {
  const same = submit('Bayan', 'Bayan');
  assert.deepEqual(same.journeys, []);
  assert.equal(same.feedback.message, 'Choose different From and To stops.');
  const reverse = submit('Palengke', 'Bayan');
  assert.deepEqual(reverse.journeys, []);
  assert.equal(reverse.feedback.message, 'No sample journey connects these stops within three segments.');
});

test('editing or swapping after a result clears stale routes', () => {
  const state = submit('Bayan', 'Palengke');
  assert.equal(state.journeys.length, 1);
  assert.deepEqual(reduce(state, { type: 'swap' }).journeys, []);
  assert.deepEqual(reduce(state, { type: 'edit', field: 'origin', value: 'Plaza' }).journeys, []);
});

test('Home submission finds the existing sample transfer without inventing fares', () => {
  const state = submit('Plaza', 'Palengke');
  assert.equal(state.journeys.length, 1);
  assert.equal(state.journeys[0].transferStops[0].name, 'Sample Bayan Terminal');
  assert.equal(state.journeys[0].transferCount, 1);
  assert.equal(state.journeys[0].fareEstimate.status, 'unknown');
});
