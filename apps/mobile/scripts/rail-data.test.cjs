const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(filename) {
  const resolved = path.resolve(root, filename);
  if (cache.has(resolved)) return cache.get(resolved);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const result = { exports: {} };
  new Function('require', 'exports', source)((name) =>
    load(path.resolve(path.dirname(resolved), name.endsWith('.json') ? name : `${name}.ts`)), result.exports);
  cache.set(resolved, result.exports);
  return result.exports;
}
const { loadBundledRailData, BUNDLED_RAIL_MANIFEST_SHA256 } = load('features/rail/bundledRailData.ts');
const { validateRailBundle, RailDataValidationError, RAIL_ATTRIBUTION } = load('features/rail/validateRailBundle.ts');
const { deriveRailBaseFare } = load('features/rail/deriveRailBaseFare.ts');
const { searchStops } = load('features/transport/searchStops.ts');
const directory = path.resolve(root, 'features/rail/data/2026-10-07');
function raw() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8'));
  return { manifest: read('manifest'), files: { lrt1: read('lrt1'), lrt2: read('lrt2'), mrt3: read('mrt3') } };
}
function quote(origin, destination, ticket = 'beep', date = '2026-10-13', extra = {}, maxAge) {
  return deriveRailBaseFare(loadBundledRailData(), { originStationId: origin, destinationStationId: destination, ticket, date, ...extra }, maxAge);
}

test('original bundled bytes match pinned manifest, hashes and lengths, not authenticity', () => {
  const bytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), BUNDLED_RAIL_MANIFEST_SHA256);
  for (const entry of JSON.parse(bytes).lines) {
    const bytes = fs.readFileSync(path.join(directory, `${entry.id}.json`));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
  assert.ok(loadBundledRailData().lines.every((line) => line.provenance.independentlyVerified === false));
});

test('baseline maps 51 distinct stations and three operators without inferring routes', () => {
  const bundle = loadBundledRailData();
  assert.equal(bundle.stations.length, 51);
  assert.equal(new Set(bundle.stations.map((station) => station.id)).size, 51);
  assert.deepEqual(bundle.lines.map((line) => line.stations.length), [25, 13, 13]);
  assert.deepEqual(bundle.lines.map((line) => line.operator.id), ['trainsph-lrmc', 'trainsph-lrta', 'trainsph-dotr-mrt3']);
  assert.equal(bundle.stations[0].id, 'lrt1_fernando_poe_jr');
  assert.deepEqual(bundle.stations[0].formerNames, ['Roosevelt']);
  assert.deepEqual(bundle.stations[0].location, { latitude: 14.657546, longitude: 121.021191 });
  assert.equal(bundle.stations[0].type, 'train_station');
  assert.equal('routes' in bundle, false);
  assert.equal('interchanges' in bundle.stations[0], false);
  assert.equal(searchStops('PITX', bundle.stations).length, 1);
});

test('source claims and attribution are preserved without independent verification', () => {
  const bundle = loadBundledRailData();
  assert.equal(bundle.attribution, RAIL_ATTRIBUTION);
  assert.equal(bundle.generatedOn, '2026-10-07');
  for (const line of bundle.lines) {
    assert.equal(line.provenance.sourceVerifiedOn, '2026-09-18');
    assert.equal(line.provenance.independentlyVerified, false);
    assert.ok(line.provenance.underlyingSourceUrl.startsWith('https://'));
    assert.ok(line.provenance.verificationNote);
    assert.equal(line.operator.source.verifiedOn, undefined);
    for (const stop of line.stations) {
      assert.equal(stop.source.verifiedOn, undefined);
      assert.equal(stop.coordinatesSourceVerifiedOn, '2026-09-20');
    }
  }
});

test('validation sorts ordinals without mutating snapshots and projections are independent', () => {
  const input = raw();
  input.files.lrt1.stations.reverse();
  const before = JSON.stringify(input);
  assert.equal(validateRailBundle(input.manifest, input.files).stations[0].ordinal, 1);
  assert.equal(JSON.stringify(input), before);
  const first = loadBundledRailData();
  first.stations[0].name = 'Synthetic mutation';
  assert.equal(loadBundledRailData().stations[0].name, 'Fernando Poe Jr.');
});

const invalidCases = {
  'schema version': (v) => { v.files.lrt1.schema_version = 2; },
  'manifest version': (v) => { v.manifest.schema_version = '1'; },
  'unknown line': (v) => { v.files.lrt1.line.id = 'lrt2'; },
  'unreviewed operator': (v) => { v.files.lrt1.line.operator = 'Unknown'; },
  'license': (v) => { v.manifest.license.id = 'Unknown'; },
  'malformed station name': (v) => { v.files.lrt1.stations[0].name = ' '; },
  'duplicate station ID': (v) => { v.files.lrt1.stations[1].id = v.files.lrt1.stations[0].id; },
  'coordinate bounds': (v) => { v.files.lrt1.stations[0].lat = 91; },
  'coordinate type': (v) => { v.files.lrt1.stations[0].lng = '121'; },
  'coordinate missing': (v) => { delete v.files.lrt1.stations[0].lat; },
  'ordinal gaps': (v) => { v.files.lrt1.stations[0].ordinal = 26; },
  'broken interchange reference': (v) => { v.files.lrt1.stations[9].interchanges[0].station_id = 'missing'; },
  'ambiguous matrix names': (v) => { v.files.lrt1.fares.station_order[0] = 'missing'; },
  'matrix size': (v) => { v.files.lrt1.fares.matrix.pop(); },
  'matrix symmetry': (v) => { v.files.lrt1.fares.matrix[0][1] = 20; },
  'invalid money': (v) => { v.files.lrt1.fares.matrix[0][1] = -1; },
  'same-station pricing': (v) => { v.files.lrt1.fares.matrix[0][0] = 16; },
  'unsupported ticket expression': (v) => { v.files.lrt1.products.single_journey.rule = 'eval(x)'; },
  'band gaps/order': (v) => { v.files.mrt3.fares.bands[1].min_span = 0; },
  'missing initial band': (v) => { v.files.mrt3.fares.bands[0].min_span = 1; },
  'invalid source date': (v) => { v.files.lrt1.provenance.verified_on = '2026-02-30'; },
  'manifest metadata mismatch': (v) => { v.manifest.lines[0].verified_on = '2026-09-19'; },
  'unsupported modifier stacking': (v) => { v.files.lrt1.modifiers[0].stacks = true; },
  'reversed modifier dates': (v) => { v.files.lrt1.modifiers[0].effective_until = '2024-01-01'; },
  'future modifier confirmation': (v) => { v.files.lrt1.modifiers[0].last_confirmed = '2027-01-01'; },
  'missing verification claim metadata': (v) => { delete v.files.lrt1.stations[0].coordinates_verified_on; },
  'future coordinate claim': (v) => { v.files.lrt1.stations[0].coordinates_verified_on = '2027-01-01'; },
  'unsafe money': (v) => { v.files.lrt1.fares.matrix[0][1] = Number.MAX_SAFE_INTEGER; },
  'missing provenance': (v) => { delete v.files.lrt1.provenance; },
};
for (const [name, corrupt] of Object.entries(invalidCases)) {
  test(`rejects ${name}`, () => {
    const input = raw();
    corrupt(input);
    assert.throws(() => validateRailBundle(input.manifest, input.files), RailDataValidationError);
  });
}

test('LRT base fares use station IDs and product rounding in either fare direction', () => {
  const from = 'lrt1_fernando_poe_jr';
  const to = 'lrt1_balintawak';
  assert.equal(quote(from, to).baseFareCentavos, 1900);
  assert.equal(quote(to, from).baseFareCentavos, 1900);
  assert.equal(quote(from, to, 'single_journey').baseFareCentavos, 2000);
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo').baseFareCentavos, 3300);
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'single_journey').baseFareCentavos, 3500);
});

test('MRT base fares use ordinal spans, with the same price for both tickets', () => {
  const line = loadBundledRailData().lines[2];
  for (const [span, expected] of [[1, 1300], [2, 1300], [3, 1600], [4, 1600], [5, 2000], [7, 2000], [8, 2400], [10, 2400], [11, 2800], [12, 2800]]) {
    assert.equal(quote(line.stations[0].id, line.stations[span].id).baseFareCentavos, expected);
    assert.equal(quote(line.stations[span].id, line.stations[0].id, 'single_journey').baseFareCentavos, expected);
  }
});

test('same-station, unknown and cross-line requests never quote a price', () => {
  assert.equal(quote('lrt2_recto', 'lrt2_recto').reason, 'same_station');
  assert.equal(quote('unknown', 'lrt2_recto').reason, 'station_unknown');
  assert.equal(quote('lrt2_recto', 'mrt3_north_avenue').reason, 'cross_line_not_supported');
});

test('journey dates and base effective dates are explicit and validated', () => {
  assert.equal(quote('lrt1_balintawak', 'lrt1_monumento', 'beep', '2025-04-01').reason, 'before_effective_date');
  assert.equal(quote('lrt1_balintawak', 'lrt1_monumento', 'beep', '2025-04-02').status, 'source_base_estimate');
  assert.equal(quote('lrt1_balintawak', 'lrt1_monumento', 'beep', '2026-02-30').reason, 'invalid_request');
  assert.equal(quote('lrt1_balintawak', 'lrt1_monumento', 'other').reason, 'invalid_request');
});

test('automatic and claimed modifiers are exposed but never applied as verified/payable fares', () => {
  const estimate = quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-10-13', { claimedModifierIds: ['concession_student_senior_pwd'] });
  assert.equal(estimate.baseFareCentavos, 3300);
  assert.equal(estimate.currentlyPayableCentavos, null);
  assert.equal(estimate.policyStatus, 'unavailable_unverified_source');
  assert.equal(estimate.applicableSourceModifiers.length, 2);
  assert.ok(estimate.applicableSourceModifiers.every(({ modifier }) => modifier.independentlyVerified === false));
  assert.equal(quote('lrt1_balintawak', 'lrt1_monumento').applicableSourceModifiers.length, 0);
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-03-22').applicableSourceModifiers.length, 0);
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-03-23').applicableSourceModifiers.length, 1);
});

test('stale and future source claims are explicit and never silently activated', () => {
  const stale = quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-12-01');
  assert.equal(stale.sourceFreshness, 'stale');
  assert.equal(stale.applicableSourceModifiers[0].freshness, 'stale');
  assert.equal(stale.currentlyPayableCentavos, null);
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-09-01').sourceFreshness, 'not_yet_verified_by_source');
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-10-13', {}, 0).sourceFreshness, 'stale');
});

test('unknown concessions and invalid freshness settings are rejected', () => {
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-10-13', { claimedModifierIds: ['unknown'] }).reason, 'invalid_request');
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-10-13', {}, -1).reason, 'invalid_request');
  assert.equal(quote('lrt2_recto', 'lrt2_antipolo', 'beep', '2026-10-13', { claimedModifierIds: 'invalid' }).reason, 'invalid_request');
});

test('rail module is pure and not wired to network, storage, screens or the Laravel client', () => {
  for (const name of ['types.ts', 'validateRailBundle.ts', 'deriveRailBaseFare.ts', 'bundledRailData.ts', 'index.ts']) {
    const content = fs.readFileSync(path.join(root, 'features/rail', name), 'utf8');
    assert.doesNotMatch(content, /from ['"](?:react|react-native|expo[^'"]*|.*\/api\/)/);
    assert.doesNotMatch(content, /\bfetch\s*\(|\beval\s*\(|AsyncStorage|FileSystem/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'screens/HomeScreen.tsx'), 'utf8'), /features\/rail/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'screens/SearchScreen.tsx'), 'utf8'), /features\/rail/);
});
