const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function harness() {
  const states = [];
  const timers = new Map();
  const requests = [];
  let index = 0;
  let timerId = 0;
  let lastDependencies;
  let effect;
  let cleanup;
  const react = {
    useState: (initial) => {
      const position = index++;
      if (!(position in states)) states[position] = initial;
      return [states[position], (value) => { states[position] = typeof value === 'function' ? value(states[position]) : value; }];
    },
    useEffect: (callback, dependencies) => {
      if (!lastDependencies || dependencies.some((value, i) => value !== lastDependencies[i])) {
        lastDependencies = dependencies;
        effect = callback;
      }
    },
  };
  class ApiError extends Error {}
  const transport = { ApiError, transportApi: { fetchStops: (query, type, signal) => new Promise((resolve, reject) => requests.push({ query, type, signal, resolve, reject })) } };
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/api/useApiStops.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', source)(
    (name) => name === 'react' ? react : transport, exports,
    (callback, delay) => { assert.equal(delay, 300); timers.set(++timerId, callback); return timerId; },
    (id) => timers.delete(id),
  );
  return {
    requests, ApiError,
    render: (query = '', type) => {
      index = 0;
      const result = exports.useApiStops(query, type);
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
      return result;
    },
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
    unmount: () => cleanup?.(),
  };
}
const settle = () => new Promise(setImmediate);
const response = { data: [], meta: { limit: 100, hasMore: false } };

test('sample mode makes no requests and opt-in debounces without duplicate rerender requests', async () => {
  const app = harness();
  app.render().load();
  app.render(' plaza ');
  app.render('plaza');
  assert.equal(app.requests.length, 0);
  app.flush();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].query, 'plaza');
  app.requests[0].resolve(response);
  await settle();
  assert.equal(app.render('plaza').state.status, 'success');
  app.render('plaza');
  app.flush();
  assert.equal(app.requests.length, 1);
  app.unmount();
});

test('query/filter changes cancel old requests and ignore stale responses', async () => {
  const app = harness();
  app.render().load();
  app.render('old'); app.flush();
  app.render('new', 'transport_terminal'); app.flush();
  assert.equal(app.requests[0].signal.aborted, true);
  app.requests[1].resolve(response);
  await settle();
  app.requests[0].resolve({ data: [{ id: 'stale' }], meta: { limit: 100, hasMore: false } });
  await settle();
  assert.deepEqual(app.render('new', 'transport_terminal').state.response, response);
  app.unmount();
});

test('failure is explicit, retry starts a new request, and returning to samples cancels it', async () => {
  const app = harness();
  app.render().load(); app.render(); app.flush();
  app.requests[0].reject(new app.ApiError('Safe test network error'));
  await settle();
  assert.equal(app.render().state.status, 'error');
  app.render().load(); app.render(); app.flush();
  assert.equal(app.requests.length, 2);
  app.render().useSamples(); app.render();
  assert.equal(app.requests[1].signal.aborted, true);
  assert.equal(app.render().state.status, 'sample');
  app.requests[1].resolve(response);
  await settle();
  assert.equal(app.render().state.status, 'sample');
  app.unmount();
});

test('unmount cancels pending debounce before any request begins', () => {
  const app = harness();
  app.render().load(); app.render(); app.unmount(); app.flush();
  assert.equal(app.requests.length, 0);
});
