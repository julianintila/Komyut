const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src/features/rail/timing');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'data/2026-10-14', name + '.json'), 'utf8'));
const moduleExports = {};
const source = ts.transpileModule(fs.readFileSync(path.join(root, 'reportedRailInterval.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
new Function('require', 'exports', source)((name) => {
  assert.ok(name.endsWith('.json'), 'timing logic must stay framework-independent');
  return JSON.parse(fs.readFileSync(path.resolve(root, name), 'utf8'));
}, moduleExports);
const { getReportedRailInterval: interval, BUNDLED_HEADWAYS_SHA256 } = moduleExports;

test('bundled original headway bytes match the manifest size and pinned consistency hash', () => {
  const bytes = fs.readFileSync(path.join(root, 'data/2026-10-14/headways.json'));
  const manifest = read('manifest');
  assert.equal(bytes.length, manifest.headways.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), BUNDLED_HEADWAYS_SHA256);
  assert.equal(manifest.headways.sha256, BUNDLED_HEADWAYS_SHA256);
  assert.equal(manifest.license.id, 'CC-BY-4.0');
});

test('three source-recorded intervals retain provenance and never provide an arrival prediction', () => {
  for (const [line, minutes] of [['lrt1', 4], ['lrt2', 13], ['mrt3', 9]]) {
    const result = interval(line, '2026-10-14');
    assert.equal(result.status, 'reported_interval');
    assert.equal(result.minimumMinutes, minutes);
    assert.equal(result.maximumMinutes, minutes);
    assert.equal(result.isLive, false);
    assert.equal(result.nextArrivalAt, null);
    assert.equal(result.source.independentlyVerified, false);
    assert.equal(result.source.sourceVerifiedOn, '2026-10-07');
    assert.equal(result.source.generatedOn, '2026-10-07');
    assert.match(result.source.url, /^https:/);
  }
});

test('the 30-day freshness boundary uses source verification, not manifest or retrieval dates', () => {
  assert.equal(interval('lrt2', '2026-11-06').status, 'reported_interval');
  assert.equal(interval('lrt2', '2026-11-07').reason, 'outdated');
  const data = read('headways'); data.generated_on = '2026-10-13';
  assert.equal(interval('lrt2', '2026-11-07', data).reason, 'outdated');
  assert.equal(interval('lrt2', '2026-10-06').reason, 'future_source');
});

test('missing lines and unverified sources produce unavailable timing without guessing', () => {
  for (const change of [(data) => { delete data.lines.lrt2; }, (data) => { data.lines.lrt2 = null; },
    (data) => { data.lines.lrt2.verified_on = null; }, (data) => { data.lines.lrt2.source_url = null; }]) {
    const data = read('headways'); change(data);
    assert.equal(interval('lrt2', '2026-10-14', data).reason, 'missing_source');
  }
});

test('unsupported schemas, malformed dates, source links and intervals reject the candidate', () => {
  for (const change of [(data) => { data.schema_version = 2; }, (data) => { data.generated_on = '2026-02-30'; },
    (data) => { data.lines.lrt2.source_url = 'http://example.test'; },
    (data) => { data.lines.lrt2.verified_on = '2026-10-08'; },
    (data) => { data.lines.lrt2.weekday = []; },
    (data) => { data.lines.lrt2.weekday[0].minutes = 0; },
    (data) => { data.lines.lrt2.weekday[0].minutes = 121; },
    (data) => { data.lines.lrt2.weekday[0].from = '25:00'; },
    (data) => { data.lines.lrt2.weekday[0].to = '04:00'; },
    (data) => { data.lines.lrt2.weekday.push(data.lines.lrt2.weekday[0]); }]) {
    const data = read('headways'); change(data);
    assert.equal(interval('lrt2', '2026-10-14', data).reason, 'invalid_data');
  }
  for (const value of [undefined, null, {}, []]) {
    if (value === undefined) continue;
    assert.equal(interval('lrt2', '2026-10-14', value).reason, 'invalid_data');
  }
});

test('request and manifest errors fail gracefully', () => {
  assert.equal(interval('unknown', '2026-10-14').reason, 'invalid_request');
  assert.equal(interval('lrt2', '2026-02-30').reason, 'invalid_request');
  for (const change of [(manifest) => { manifest.schema_version = 2; },
    (manifest) => { manifest.headways.sha256 = '0'.repeat(64); },
    (manifest) => { manifest.generated_on = '2026-10-06'; },
    (manifest) => { manifest.license.id = 'unknown'; }]) {
    const manifest = read('manifest'); change(manifest);
    assert.equal(interval('lrt2', '2026-10-14', read('headways'), manifest).reason, 'invalid_data');
  }
});

test('differing published bands produce a reported range without choosing a fictitious departure', () => {
  const data = read('headways'); data.lines.lrt2.weekend[0].minutes = 15;
  const before = structuredClone(data);
  const result = interval('lrt2', '2026-10-14', data);
  assert.equal(result.minimumMinutes, 13); assert.equal(result.maximumMinutes, 15);
  assert.equal(result.nextArrivalAt, null);
  assert.deepEqual(data, before);
});
