const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src');
const modules = new Map();
const nativeMocks = {};
function load(filename) {
  const resolved = path.resolve(root, filename);
  if (modules.has(resolved)) return modules.get(resolved);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const result = { exports: {} };
  new Function('require', 'exports', source)((name) => {
    if (!name.startsWith('.')) {
      if (nativeMocks[name]) return nativeMocks[name];
      throw new Error(`Unexpected native dependency: ${name}`);
    }
    return load(path.resolve(path.dirname(resolved), name.endsWith('.json') ? name : `${name}.ts`));
  }, result.exports);
  modules.set(resolved, result.exports);
  return result.exports;
}
const feature = 'features/rail/persistence/';
const { createRailRepository } = load(feature + 'createRailRepository.ts');
const { fetchRailBytes } = load(feature + 'fetchRailBytes.ts');
const { verifyRailSnapshot, inspectRailManifest, RailRefreshError, DATASET_LIMIT } = load(feature + 'railSnapshot.ts');
const { VERSION_PATTERN } = load(feature + 'railStorage.ts');
const { deriveRailBaseFare } = load('features/rail/deriveRailBaseFare.ts');
const sha256 = async (bytes) => createHash('sha256').update(bytes).digest('hex');
const originalPath = path.resolve(root, 'features/rail/data/2026-10-07');
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

// Mutated records below are synthetic fixtures, never production transport data.
function snapshot({ generatedOn = '2026-10-14', mutate, manifestMutate } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(originalPath, 'manifest.json')));
  manifest.generated_on = generatedOn;
  const files = {};
  for (const id of ['lrt1', 'lrt2', 'mrt3']) {
    const data = JSON.parse(fs.readFileSync(path.join(originalPath, `${id}.json`)));
    if (mutate) mutate(data, id);
    const bytes = encode(data);
    files[id] = bytes;
    const entry = manifest.lines.find((entry) => entry.id === id);
    entry.bytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    entry.verified_on = data.provenance.verified_on;
    entry.fares_effective_from = data.provenance.fares_effective_from;
  }
  if (manifestMutate) manifestMutate(manifest);
  return { manifest: encode(manifest), files };
}
function fileMap(snapshot) {
  return { 'manifest.json': snapshot.manifest, ...Object.fromEntries(Object.entries(snapshot.files).map(([id, bytes]) => [`${id}.json`, bytes])) };
}
function network(snapshot, options = {}) {
  const files = fileMap(snapshot);
  const calls = [];
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push(url);
      assert.equal(init.credentials, 'omit');
      assert.equal(init.redirect, 'error');
      assert.ok(url.startsWith('https://trainsph-data.web.app/'));
      const file = url.split('/').pop();
      if (options.failFile === file) throw new Error('Sensitive network diagnostic');
      if (options.hangFile === file) return new Promise(() => {});
      return new Response(files[file], { status: options.status ?? 200 });
    },
  };
}
class MemoryStorage {
  versions = new Map();
  pending = new Map();
  events = [];
  failStage = false;
  failCommit = false;
  failDiscard = false;
  corruptStage = false;
  async listVersions() { return [...this.versions.keys()]; }
  async read(version, name, limit, staged = false) {
    const bytes = (staged ? this.pending : this.versions).get(version)?.[name];
    if (!bytes) throw new Error('Missing file');
    if (bytes.length > limit) throw new Error('Oversized stored file');
    return new Uint8Array(bytes);
  }
  async stage(version, snapshot, receipt) {
    this.events.push('stage');
    const files = fileMap(snapshot);
    this.pending.set(version, this.failStage ? { 'manifest.json': files['manifest.json'] } : { ...files, 'receipt.json': encode(receipt) });
    if (this.corruptStage) this.pending.get(version)['lrt1.json'] = encode({ broken: true });
    if (this.failStage) throw new Error('Interrupted write');
  }
  async commit(version) {
    this.events.push('commit');
    if (this.failCommit) throw new Error('Interrupted commit');
    if (this.versions.has(version)) throw new Error('Cannot replace immutable version');
    this.versions.set(version, this.pending.get(version));
    this.pending.delete(version);
  }
  async discardStage(version) {
    if (this.failDiscard) throw new Error('Cleanup unavailable');
    this.pending.delete(version);
  }
}
let counter = 0;
function repository(storage, net, extra = {}) {
  return createRailRepository({ storage, fetcher: net.fetcher, sha256, nonce: () => (++counter).toString(16).padStart(32, '0'), now: () => new Date('2026-10-15T00:00:00.000Z'), ...extra });
}
async function seed(storage, data = snapshot()) {
  const repo = repository(storage, network(data));
  const result = await repo.refresh();
  assert.equal(result.status, 'updated');
  return result.active;
}

test('first-launch load uses bundled data without network or writes', async () => {
  const storage = new MemoryStorage();
  const net = network(snapshot());
  const result = await repository(storage, net).load();
  assert.equal(result.source, 'bundled');
  assert.equal(result.bundle.stations.length, 51);
  assert.equal(net.calls.length, 0);
  assert.deepEqual(storage.events, []);
});

test('complete refresh validates then commits exactly one version and reloads after restart', async () => {
  const storage = new MemoryStorage();
  const data = snapshot();
  const net = network(data);
  const repo = repository(storage, net);
  const result = await repo.refresh();
  assert.equal(result.status, 'updated');
  assert.equal(result.active.source, 'persisted');
  assert.equal(result.active.bundle.generatedOn, '2026-10-14');
  assert.equal(result.active.refreshedAt, '2026-10-15T00:00:00.000Z');
  assert.deepEqual(storage.events, ['stage', 'commit']);
  assert.equal(storage.pending.size, 0);
  assert.equal(storage.versions.size, 1);
  assert.equal(net.calls.length, 4);
  assert.ok(VERSION_PATTERN.test(result.active.version));
  const restartNet = network(data);
  const restarted = await repository(storage, restartNet).load();
  assert.deepEqual(restarted, result.active);
  assert.equal(restartNet.calls.length, 0);
});

test('invalid persisted bytes are rejected and bundled fallback stays usable', async () => {
  const storage = new MemoryStorage();
  const active = await seed(storage);
  storage.versions.get(active.version)['lrt1.json'][0] ^= 1;
  const result = await repository(storage, network(snapshot())).load();
  assert.equal(result.source, 'bundled');
  assert.equal(result.cacheWarning, 'invalid_cache');
});

test('corrupt latest version falls back to a previous valid persisted version', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage);
  const latest = await seed(storage, snapshot({ generatedOn: '2026-10-16' }));
  storage.versions.get(latest.version)['manifest.json'][0] ^= 1;
  const result = await repository(storage, network(snapshot())).load();
  assert.equal(result.version, previous.version);
  assert.equal(result.cacheWarning, 'invalid_cache');
  assert.equal(storage.versions.size, 2);
});

test('complete-looking cache with invalid schema is revalidated, not trusted by hashes alone', async () => {
  const storage = new MemoryStorage();
  const data = snapshot({ mutate: (data, id) => { if (id === 'lrt1') data.schema_version = 2; } });
  const hash = await sha256(data.manifest);
  const key = `v1-000000000001-${hash}-${'0'.repeat(32)}`;
  storage.versions.set(key, { ...fileMap(data), 'receipt.json': encode({ format: 1, manifestHash: hash, refreshedAt: '2026-10-15T00:00:00.000Z' }) });
  assert.equal((await repository(storage, network(data)).load()).source, 'bundled');
});

test('cache receipt hash and timestamp are validated on restart', async () => {
  for (const receipt of [{ format: 1, manifestHash: 'f'.repeat(64), refreshedAt: '2026-10-15T00:00:00.000Z' }, { format: 1, refreshedAt: 'not-a-date' }]) {
    const storage = new MemoryStorage();
    const active = await seed(storage);
    storage.versions.get(active.version)['receipt.json'] = encode(receipt);
    assert.equal((await repository(storage, network(snapshot())).load()).source, 'bundled');
  }
});

test('network and HTTP failures retain last-known-good data without exposing diagnostics', async () => {
  for (const options of [{ failFile: 'lrt2.json' }, { status: 503 }]) {
    const storage = new MemoryStorage();
    const previous = await seed(storage);
    const result = await repository(storage, network(snapshot({ generatedOn: '2026-10-16' }), options)).refresh();
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'network');
    assert.equal(result.active.version, previous.version);
    assert.doesNotMatch(result.message, /Sensitive/);
    assert.equal(storage.versions.size, 1);
  }
});

test('timeout settles even when transport ignores abort and retains last-known-good', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage);
  const result = await repository(storage, network(snapshot(), { hangFile: 'manifest.json' }), { timeoutMs: 10 }).refresh();
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'timeout');
  assert.equal(result.active.version, previous.version);
});

test('hash mismatch and validly hashed invalid structures never reach staging', async () => {
  for (const invalid of ['hash', 'schema', 'data']) {
    const storage = new MemoryStorage();
    const data = snapshot({ mutate: (data, id) => { if (id === 'lrt1' && invalid !== 'hash') { if (invalid === 'schema') data.schema_version = 2; else data.stations[0].lat = 91; } } });
    if (invalid === 'hash') data.files.lrt1[0] ^= 1;
    const result = await repository(storage, network(data)).refresh();
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, invalid === 'hash' ? 'hash_mismatch' : 'invalid_data');
    assert.deepEqual(storage.events, []);
    assert.equal(result.active.source, 'bundled');
  }
});

test('unsupported manifest version, missing line and oversized declarations stop before downloads', async () => {
  for (const mutate of [(m) => { m.schema_version = 2; }, (m) => { m.lines.pop(); }, (m) => { m.lines[0].bytes = DATASET_LIMIT + 1; }]) {
    const storage = new MemoryStorage();
    const net = network(snapshot({ manifestMutate: mutate }));
    const result = await repository(storage, net).refresh();
    assert.equal(result.reason, 'invalid_data');
    assert.equal(net.calls.length, 1);
    assert.deepEqual(storage.events, []);
  }
});

test('interrupted staging and commit preserve previous versions through restart', async () => {
  for (const field of ['failStage', 'failCommit', 'corruptStage']) {
    const storage = new MemoryStorage();
    const previous = await seed(storage);
    storage[field] = true;
    storage.failDiscard = true;
    const result = await repository(storage, network(snapshot({ generatedOn: '2026-10-16' }))).refresh();
    assert.equal(result.status, 'failed');
    assert.equal(result.active.version, previous.version);
    assert.equal(storage.versions.size, 1);
    assert.equal((await repository(storage, network(snapshot())).load()).version, previous.version);
  }
});

test('storage access failure gracefully loads baseline and failed save does not activate', async () => {
  const storage = new MemoryStorage();
  storage.listVersions = async () => { throw new Error('Storage permission error'); };
  const repo = repository(storage, network(snapshot()));
  assert.equal((await repo.load()).cacheWarning, 'storage_unavailable');
  assert.equal((await repo.refresh()).reason, 'storage');
  assert.equal((await repo.load()).source, 'bundled');
});

test('unchanged validated refresh does not rewrite persisted files or verification dates', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage);
  const events = [...storage.events];
  const repo = repository(storage, network(snapshot()));
  const result = await repo.refresh();
  assert.equal(result.status, 'unchanged');
  assert.equal(result.active.version, previous.version);
  assert.deepEqual(storage.events, events);
  assert.equal(result.active.bundle.lines[0].provenance.sourceVerifiedOn, '2026-09-18');
});

test('simultaneous refresh calls share one operation and activation', async () => {
  const storage = new MemoryStorage();
  const net = network(snapshot());
  const repo = repository(storage, net);
  const first = repo.refresh();
  const second = repo.refresh();
  assert.equal(first, second);
  await first;
  assert.equal(storage.versions.size, 1);
  assert.equal(net.calls.length, 4);
});

test('older remote snapshot is refused without replacing a valid newer cache', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage, snapshot({ generatedOn: '2026-10-16' }));
  const result = await repository(storage, network(snapshot())).refresh();
  assert.equal(result.reason, 'older_snapshot');
  assert.equal(result.active.version, previous.version);
});

test('line generation, source verification, effective dates and refresh receipt remain independent', async () => {
  const storage = new MemoryStorage();
  const data = snapshot({ mutate: (data, id) => { if (id === 'lrt1') data.provenance.generated_on = '2026-10-08'; } });
  const result = await repository(storage, network(data)).refresh();
  assert.equal(result.status, 'updated');
  assert.equal(result.active.bundle.generatedOn, '2026-10-14');
  assert.equal(result.active.bundle.lines[0].provenance.generatedOn, '2026-10-08');
  assert.equal(result.active.bundle.lines[1].provenance.generatedOn, '2026-10-07');
  assert.equal(result.active.bundle.lines[0].provenance.sourceVerifiedOn, '2026-09-18');
  assert.equal(result.active.bundle.lines[0].provenance.faresEffectiveFrom, '2025-04-02');
  const quote = deriveRailBaseFare(result.active.bundle, { originStationId: 'lrt2_recto', destinationStationId: 'lrt2_antipolo', ticket: 'beep', date: '2026-12-01' });
  assert.equal(quote.currentlyPayableCentavos, null);
  assert.equal(quote.sourceFreshness, 'stale');
  assert.equal(quote.policyStatus, 'unavailable_unverified_source');
});

test('size bounds cover response headers and streamed bodies without trusting content-length', async () => {
  await assert.rejects(fetchRailBytes('https://trainsph-data.web.app/manifest.json', 5, async () => new Response('123456', { headers: { 'content-length': '6' } })), (e) => e.kind === 'size_limit');
  await assert.rejects(fetchRailBytes('https://trainsph-data.web.app/manifest.json', 5, async () => new Response('123456', { headers: { 'content-length': '1' } })), (e) => e.kind === 'size_limit');
  await assert.rejects(fetchRailBytes('http://trainsph-data.web.app/manifest.json', 5, async () => { throw Error('must not fetch'); }), RailRefreshError);
});

test('body-read timeout and malformed UTF-8 fail safely', async () => {
  const stream = new ReadableStream({ start() {} });
  await assert.rejects(fetchRailBytes('https://trainsph-data.web.app/manifest.json', 100, async () => new Response(stream), 10), (e) => e.kind === 'timeout');
  assert.throws(() => inspectRailManifest(new Uint8Array([255, 255])), (e) => e.kind === 'invalid_data');
});

test('original dataset bytes are hashed before JSON parsing', async () => {
  const data = snapshot();
  data.files.lrt1 = new Uint8Array(data.files.lrt1.length).fill(255);
  await assert.rejects(verifyRailSnapshot(data, sha256), (e) => e.kind === 'hash_mismatch');
});

test('incomplete committed directory is rejected after an interrupted platform move', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage);
  storage.commit = async (version) => {
    storage.versions.set(version, { 'manifest.json': storage.pending.get(version)['manifest.json'] });
    throw new Error('Interrupted move');
  };
  const result = await repository(storage, network(snapshot({ generatedOn: '2026-10-16' }))).refresh();
  assert.equal(result.status, 'failed');
  assert.equal(result.active.version, previous.version);
  assert.equal((await repository(storage, network(snapshot())).load()).version, previous.version);
});

test('late transport completion after timeout cannot stage or activate data', async () => {
  let resolve;
  const storage = new MemoryStorage();
  const repo = repository(storage, { fetcher: () => new Promise((done) => { resolve = done; }) }, { timeoutMs: 10 });
  assert.equal((await repo.refresh()).reason, 'timeout');
  resolve(new Response(snapshot().manifest));
  await new Promise((done) => setTimeout(done, 5));
  assert.deepEqual(storage.events, []);
  assert.equal((await repo.load()).source, 'bundled');
});

test('disk readback corruption prevents activation even after all downloads validate', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage);
  storage.corruptStage = true;
  const result = await repository(storage, network(snapshot({ generatedOn: '2026-10-16' }))).refresh();
  assert.equal(result.reason, 'hash_mismatch');
  assert.equal(result.active.version, previous.version);
  assert.equal(storage.events.filter((event) => event === 'commit').length, 1);
});

test('a newer manifest cannot conceal regressed per-line source metadata', async () => {
  const storage = new MemoryStorage();
  const previous = await seed(storage, snapshot({ mutate: (data, id) => { if (id === 'lrt1') data.provenance.generated_on = '2026-10-08'; } }));
  const result = await repository(storage, network(snapshot({ generatedOn: '2026-10-16' }))).refresh();
  assert.equal(result.reason, 'older_snapshot');
  assert.equal(result.active.version, previous.version);
});

test('Expo adapter writes original bytes into documents storage and survives repository restart', async () => {
  const entries = new Map();
  function uri(parts) { return parts.map((part) => typeof part === 'string' ? part : part.uri).join('/'); }
  class Directory {
    constructor(...parts) { this.uri = uri(parts); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return entries.get(this.uri) === 'directory'; }
    create(options = {}) { if (this.exists && !options.idempotent) throw Error('Exists'); entries.set(this.uri, 'directory'); }
    list() { return [...entries.keys()].filter((key) => key.startsWith(this.uri + '/') && !key.slice(this.uri.length + 1).includes('/')).map((key) => entries.get(key) === 'directory' ? new Directory(key) : new File(key)); }
    async move(target) {
      if (target.exists) throw Error('No replacement permitted');
      const source = this.uri;
      for (const [key, value] of [...entries]) if (key === source || key.startsWith(source + '/')) { entries.set(target.uri + key.slice(source.length), value); entries.delete(key); }
      this.uri = target.uri;
    }
    delete() { for (const key of [...entries.keys()]) if (key === this.uri || key.startsWith(this.uri + '/')) entries.delete(key); }
  }
  class File {
    constructor(...parts) { this.uri = uri(parts); }
    get exists() { return entries.has(this.uri); }
    get size() { return entries.get(this.uri)?.byteLength ?? 0; }
    create() { if (this.exists) throw Error('Exists'); entries.set(this.uri, new Uint8Array()); }
    write(bytes) { entries.set(this.uri, new Uint8Array(bytes)); }
    async bytes() { return new Uint8Array(entries.get(this.uri)); }
  }
  const data = snapshot();
  const net = network(data);
  nativeMocks['expo-file-system'] = { Directory, File, Paths: { document: 'file:///documents' } };
  nativeMocks['expo-crypto'] = {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digest: async (_algorithm, bytes) => Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer,
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
  };
  nativeMocks['expo/fetch'] = { fetch: net.fetcher };
  const { createExpoRailRepository } = load(feature + 'expoRailRepository.ts');
  assert.equal(entries.size, 0);
  const repo = createExpoRailRepository();
  assert.equal((await repo.load()).source, 'bundled');
  assert.equal(entries.size, 0);
  const result = await repo.refresh();
  assert.equal(result.status, 'updated');
  assert.ok([...entries.keys()].every((key) => key.startsWith('file:///documents/komyut-rail-v1')));
  assert.ok([...entries.keys()].every((key) => !key.includes('/pending-')));
  const restart = await createExpoRailRepository().load();
  assert.equal(restart.manifestHash, result.active.manifestHash);
  const { createExpoRailStorage } = load(feature + 'expoRailStorage.ts');
  await assert.rejects(createExpoRailStorage().read('../outside', 'manifest.json', 100), (error) => error.kind === 'storage');
  await assert.rejects(createExpoRailStorage().read(result.active.version, '../secret', 100), (error) => error.kind === 'storage');
});
