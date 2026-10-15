const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
function compile(file, requireModule) {
  const result = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/features/rail/ui', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(requireModule, result, result.exports);
  return result.exports;
}
const { initialRailSelection: initial, selectRailStation: select, railEstimateDate } = compile('railSelection.ts', () => { throw Error('Pure helper must not require a runtime module'); });
const stations = [{ id: 'a', lineId: 'lrt1' }, { id: 'b', lineId: 'lrt1' }, { id: 'c', lineId: 'lrt2' }];
test('selection requires known, distinct stations on the same line without mutating inputs', () => {
  assert.match(select({ ...initial, selecting: 'destination' }, 'b', stations).error, /From station first/);
  assert.match(select(initial, 'unknown', stations).error, /unavailable/);
  const from = select(initial, 'a', stations);
  assert.equal(initial.originId, null);
  assert.equal(from.selecting, 'destination');
  assert.match(select(from, 'a', stations).error, /different/);
  assert.match(select(from, 'c', stations).error, /same train line/);
  const pair = select(from, 'b', stations);
  assert.equal(pair.destinationId, 'b');
  assert.equal(pair.error, null);
  assert.match(select({ ...pair, selecting: 'origin' }, 'b', stations).error, /different/);
  assert.equal(select({ ...pair, selecting: 'origin' }, 'c', stations).destinationId, null);
  assert.equal(select({ ...pair, selecting: 'origin' }, 'a', stations).destinationId, 'b');
});
test('estimate date is the Philippine calendar date across UTC midnight boundaries', () => {
  assert.equal(railEstimateDate(new Date('2026-10-12T15:59:59Z')), '2026-10-12');
  assert.equal(railEstimateDate(new Date('2026-10-12T16:00:00Z')), '2026-10-13');
});
function harness() {
  const slots = [];
  const requests = [];
  let index = 0;
  let effect;
  let cleanup;
  const react = {
    useState: (initial) => {
      const i = index++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef: (initial) => {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect: (callback) => { const i = index++; if (!(i in slots)) { slots[i] = true; effect = callback; } },
  };
  const request = (kind) => new Promise((resolve, reject) => requests.push({ kind, resolve, reject }));
  const repo = { load: () => request('load'), refresh: () => request('refresh') };
  const hook = compile('useRailData.ts', (name) => name === 'react' ? react : { getRailRepository: () => repo }).useRailData;
  return {
    requests,
    render: () => { index = 0; const value = hook(); if (effect) { cleanup = effect(); effect = undefined; } return value; },
    unmount: () => cleanup(),
    restartEffect: () => { cleanup(); slots.pop(); },
  };
}
const settle = () => new Promise(setImmediate);
const active = { source: 'bundled', bundle: { generatedOn: '2026-10-07' } };
test('rail hook loads once on mount, does not auto-refresh and ignores duplicate actions', async () => {
  const app = harness();
  app.render(); app.render();
  assert.deepEqual(app.requests.map((item) => item.kind), ['load']);
  await app.render().refresh();
  assert.equal(app.requests.length, 1);
  app.requests[0].resolve(active); await settle();
  assert.equal(app.render().state.active, active);
  const pending = app.render().refresh();
  assert.equal(app.render().state.status, 'refreshing');
  assert.equal(app.render().state.active, active);
  app.requests[1].resolve({ status: 'updated', active: { ...active, source: 'persisted' } });
  await pending;
  assert.equal(app.render().state.active.source, 'persisted');
  app.unmount();
});
test('safe initialization failure is retryable and refresh failure preserves the last dataset', async () => {
  const app = harness(); app.render();
  app.requests[0].reject(Error('Private diagnostic must not leak')); await settle();
  assert.equal(app.render().state.status, 'error');
  assert.doesNotMatch(app.render().state.message, /Private/);
  const retry = app.render().retry();
  app.requests[1].resolve(active); await retry;
  const refresh = app.render().refresh();
  app.requests[2].resolve({ status: 'failed', active, message: 'Safe network failure' }); await refresh;
  assert.equal(app.render().state.active, active);
  assert.equal(app.render().state.message, 'Safe network failure');
  const again = app.render().refresh();
  app.requests[3].resolve({ status: 'unchanged', active }); await again;
  assert.equal(app.render().state.status, 'ready');
  assert.equal(app.render().state.message, 'Rail data is unchanged.');
  const unexpected = app.render().refresh();
  app.requests[4].reject(Error('Private storage exception')); await unexpected;
  assert.equal(app.render().state.active, active);
  assert.doesNotMatch(app.render().state.message, /Private/);
  app.unmount();
});
test('unmount ignores late initialization and restarted effects ignore obsolete requests', async () => {
  const app = harness(); app.render(); app.unmount();
  app.requests[0].resolve(active); await settle();
  assert.equal(app.render().state.status, 'loading');
  const restarted = harness(); restarted.render(); restarted.restartEffect(); restarted.render();
  restarted.requests[1].resolve(active); await settle();
  restarted.requests[0].resolve({ ...active, source: 'obsolete' }); await settle();
  assert.equal(restarted.render().state.active, active);
  restarted.unmount();
});
test('native rail repository is created lazily and shared for the application session', () => {
  let creations = 0;
  const instance = {};
  const { getRailRepository } = compile('railRepository.ts', () => ({ createExpoRailRepository: () => { creations++; return instance; } }));
  assert.equal(creations, 0);
  assert.equal(getRailRepository(), instance);
  assert.equal(getRailRepository(), instance);
  assert.equal(creations, 1);
});
