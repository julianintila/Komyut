const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const cache = new Map();
function load(filename) {
  const resolved = path.resolve(__dirname, '../src', filename);
  if (cache.has(resolved)) return cache.get(resolved);
  const result = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'exports', source)((name) => load(path.resolve(path.dirname(resolved), `${name}.ts`)), result.exports);
  cache.set(resolved, result.exports);
  return result.exports;
}
const { createTransportApi, ApiError } = load('api/transportApi.ts');
const response = (data = [], limit = 100, hasMore = false) => ({ data, meta: { limit, hasMore } });
const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const fixture = { id: 'test-stop', name: 'Synthetic API test stop', type: 'bus_stop' };
const api = (body) => createTransportApi('https://example.test/api', async () => json(body));
const kind = (expected) => (error) => error instanceof ApiError && error.kind === expected;

test('stops reuse domain fields including valid coordinates and source metadata', async () => {
  const stop = { ...fixture, location: { latitude: 0, longitude: 0 }, source: { sourceName: 'Synthetic test fixture', notes: 'Not travel information' } };
  const result = await api(response([stop])).fetchStops();
  assert.equal(result.data[0].id, stop.id);
  assert.deepEqual(result.data[0].location, stop.location);
  assert.equal(result.data[0].source.sourceName, stop.source.sourceName);
  assert.equal(result.data[0].source.verifiedOn, undefined);
});

test('routes preserve stable references and ordered stop IDs', async () => {
  const route = { id: 'test-route', name: 'Synthetic test route', operatorId: 'test-operator', vehicleType: 'bus', stopIds: ['second', 'first'] };
  assert.deepEqual((await api(response([route])).fetchRoutes()).data[0].stopIds, ['second', 'first']);
});

test('empty success remains empty and bounded metadata is retained', async () => {
  assert.deepEqual(await api(response()).fetchStops(), response());
  assert.equal((await api(response([fixture], 1, true)).fetchStops()).meta.hasMore, true);
});

test('configured URL is used and query parameters are trimmed and encoded', async () => {
  const calls = [];
  const client = createTransportApi('https://example.test/api/', async (url, options) => { calls.push({ url, options }); return json(response()); });
  await client.fetchStops('  A & %_ /  ', 'transport_terminal');
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/stops');
  assert.equal(url.searchParams.get('q'), 'A & %_ /');
  assert.equal(url.searchParams.get('type'), 'transport_terminal');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
  await client.fetchRoutes();
  assert.equal(new URL(calls[1].url).pathname, '/api/routes');
});

test('missing, unsafe, and credential-bearing configuration fails without fetching', async () => {
  for (const url of [undefined, '', 'relative/path', 'file:///api', 'https://secret:password@example.test/api', 'https://example.test/api?token=secret', 'https://example.test/api#fragment']) {
    const client = createTransportApi(url, async () => { throw new Error('Fetch must not run'); });
    await assert.rejects(client.fetchStops(), kind('configuration'));
  }
});

test('HTTP errors are typed without revealing server diagnostics', async () => {
  const client = createTransportApi('https://example.test/api', async () => new Response('sensitive server diagnostic', { status: 503 }));
  await assert.rejects(client.fetchStops(), (error) => kind('http')(error) && error.status === 503 && !error.message.includes('sensitive'));
});

test('network failures have a safe actionable message', async () => {
  const client = createTransportApi('https://example.test/api', async () => { throw new Error('internal network detail'); });
  await assert.rejects(client.fetchRoutes(), kind('network'));
});

test('timeout settles even when a transport ignores abort', async () => {
  const client = createTransportApi('https://example.test/api', () => new Promise(() => {}), 10);
  await assert.rejects(client.fetchStops(), kind('timeout'));
});

test('cancellation settles active requests and rejects pre-aborted requests', async () => {
  const controller = new AbortController();
  const client = createTransportApi('https://example.test/api', () => new Promise(() => {}));
  const pending = client.fetchStops('', undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, kind('cancelled'));
  await assert.rejects(client.fetchStops('', undefined, controller.signal), kind('cancelled'));
});

test('malformed JSON and invalid response envelopes are rejected', async () => {
  const client = createTransportApi('https://example.test/api', async () => new Response('<html>not JSON</html>'));
  await assert.rejects(client.fetchStops(), kind('invalid_response'));
  for (const body of [{}, response([], 101), response([], 0), { data: [], meta: { limit: 1, hasMore: 'false' } }, response([fixture, fixture], 1)]) {
    await assert.rejects(api(body).fetchStops(), kind('invalid_response'));
  }
});

test('bad stop values, duplicate IDs and invalid coordinates reject the whole list', async () => {
  for (const data of [[{ ...fixture, type: 'unsupported' }], [{ ...fixture, id: '' }], [fixture, fixture],
    [{ ...fixture, location: { latitude: 91, longitude: 0 } }], [{ ...fixture, address: 123 }]]) {
    await assert.rejects(api(response(data)).fetchStops(), kind('invalid_response'));
  }
});

test('source dates and route references are validated without guessing missing data', async () => {
  await assert.rejects(api(response([{ ...fixture, source: { sourceName: 'Synthetic', verifiedOn: '2026-02-30' } }])).fetchStops(), kind('invalid_response'));
  const route = { id: 'test-route', name: 'Synthetic test route', operatorId: 'test-operator', vehicleType: 'bus', stopIds: ['first', 'first'] };
  await assert.rejects(api(response([route])).fetchRoutes(), kind('invalid_response'));
});
