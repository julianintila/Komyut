const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const directory = path.resolve(__dirname, '../src/features/transport/data');
const cache = new Map();

function load(name) {
  const filename = path.resolve(directory, `${name}.ts`);
  if (cache.has(filename)) return cache.get(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const result = { exports: {} };
  new Function('require', 'exports', source)((dependency) => load(dependency), result.exports);
  cache.set(filename, result.exports);
  return result.exports;
}

const { sampleStops } = load('sampleStops');
const { sampleOperators } = load('sampleOperators');
const { sampleRoutes } = load('sampleRoutes');

test('each sample collection has unique, nonempty IDs', () => {
  for (const records of [sampleStops, sampleOperators, sampleRoutes]) {
    assert.ok(records.length > 0);
    const ids = records.map((record) => record.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(id.trim().length > 0);
  }
});

test('every route references an existing operator', () => {
  const ids = new Set(sampleOperators.map((operator) => operator.id));
  for (const route of sampleRoutes) {
    assert.ok(ids.has(route.operatorId), `${route.id}: unknown operator`);
  }
});

test('every route references existing stops in an explicit sequence', () => {
  const ids = new Set(sampleStops.map((stop) => stop.id));
  for (const route of sampleRoutes) {
    assert.ok(route.stopIds.length >= 2, `${route.id}: too few stops`);
    for (const id of route.stopIds) {
      assert.ok(ids.has(id), `${route.id}: unknown stop ${id}`);
    }
  }
});

test('stop IDs do not repeat within a sample route', () => {
  for (const route of sampleRoutes) {
    assert.equal(new Set(route.stopIds).size, route.stopIds.length, route.id);
  }
});

test('route vehicle types match their sample operators', () => {
  for (const route of sampleRoutes) {
    const operator = sampleOperators.find((record) => record.id === route.operatorId);
    assert.ok(operator?.vehicleTypes.includes(route.vehicleType), route.id);
  }
});

test('all records are explicitly fictional with no verification claims', () => {
  for (const record of [...sampleStops, ...sampleOperators, ...sampleRoutes]) {
    assert.ok(record.id.startsWith('sample-'));
    assert.ok(record.name.startsWith('Sample '));
    assert.equal(record.source.sourceName, 'Fictional development fixture');
    assert.match(record.source.notes, /fictional/);
    assert.match(record.source.notes, /not for travel planning/i);
    assert.equal(record.source.verifiedOn, undefined);
    assert.equal(record.source.sourceUrl, undefined);
  }
});
