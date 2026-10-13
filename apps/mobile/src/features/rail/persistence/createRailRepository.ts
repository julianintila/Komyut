import { BUNDLED_RAIL_MANIFEST_SHA256, loadBundledRailData } from '../bundledRailData';
import type { RailBundle, RailLineId } from '../types';
import { RAIL_LINE_IDS } from '../validateRailBundle';
import { fetchRailBytes } from './fetchRailBytes';
import type { RailFetch } from './fetchRailBytes';
import { DATASET_LIMIT, inspectRailManifest, MANIFEST_LIMIT, parseRailJson, RAIL_DATA_URL, RECEIPT_LIMIT, RailRefreshError, verifyRailSnapshot } from './railSnapshot';
import type { RailFailure, RailSnapshotBytes, Sha256 } from './railSnapshot';
import { VERSION_PATTERN } from './railStorage';
import type { RailReceipt, RailStorage } from './railStorage';

export type RailActiveData = {
  bundle: RailBundle;
  source: 'bundled' | 'persisted';
  manifestHash: string;
  version?: string;
  refreshedAt?: string;
  cacheWarning?: 'invalid_cache' | 'storage_unavailable';
};
export type RailRefreshResult =
  | { status: 'updated' | 'unchanged'; active: RailActiveData }
  | { status: 'failed'; active: RailActiveData; reason: RailFailure; message: string };
export type RailRepository = { load(): Promise<RailActiveData>; refresh(): Promise<RailRefreshResult> };

export function createRailRepository(dependencies: {
  storage: RailStorage;
  sha256: Sha256;
  fetcher: RailFetch;
  nonce: () => string;
  now?: () => Date;
  timeoutMs?: number;
}): RailRepository {
  const { storage, sha256, fetcher } = dependencies;
  let active: RailActiveData = { bundle: loadBundledRailData(), source: 'bundled', manifestHash: BUNDLED_RAIL_MANIFEST_SHA256 };
  let loaded = false;
  let queue: Promise<unknown> = Promise.resolve();
  let refreshing: Promise<RailRefreshResult> | undefined;
  function olderThanCurrent(bundle: RailBundle): boolean {
    return bundle.generatedOn < active.bundle.generatedOn || bundle.lines.some((line) => {
      const current = active.bundle.lines.find((item) => item.id === line.id)!;
      return line.provenance.generatedOn < current.provenance.generatedOn || line.provenance.sourceVerifiedOn < current.provenance.sourceVerifiedOn;
    });
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  async function readVersion(version: string, staged = false): Promise<RailActiveData> {
    const key = VERSION_PATTERN.exec(version);
    if (!key) throw new RailRefreshError('invalid_data');
    const receiptValue = parseRailJson(await storage.read(version, 'receipt.json', RECEIPT_LIMIT, staged), RECEIPT_LIMIT);
    if (typeof receiptValue !== 'object' || receiptValue === null) throw new RailRefreshError('invalid_data');
    const receipt = receiptValue as Partial<RailReceipt>;
    if (receipt.format !== 1 || receipt.manifestHash !== key[2] || typeof receipt.refreshedAt !== 'string'
      || !Number.isFinite(Date.parse(receipt.refreshedAt)) || new Date(receipt.refreshedAt).toISOString() !== receipt.refreshedAt) throw new RailRefreshError('invalid_data');
    const manifest = await storage.read(version, 'manifest.json', MANIFEST_LIMIT, staged);
    inspectRailManifest(manifest);
    const files = {} as Record<RailLineId, Uint8Array>;
    for (const id of RAIL_LINE_IDS) files[id] = await storage.read(version, `${id}.json`, DATASET_LIMIT, staged);
    const verified = await verifyRailSnapshot({ manifest, files }, sha256, key[2]);
    return { ...verified, source: 'persisted', version, refreshedAt: receipt.refreshedAt };
  }
  async function loadInternal(): Promise<RailActiveData> {
    if (loaded) return active;
    try {
      const versions = (await storage.listVersions()).filter((key) => VERSION_PATTERN.test(key)).sort().reverse();
      for (const version of versions) {
        try {
          const candidate = await readVersion(version);
          if (olderThanCurrent(candidate.bundle)) throw new RailRefreshError('older_snapshot');
          active = { ...candidate, ...(active.cacheWarning ? { cacheWarning: active.cacheWarning } : {}) };
          break;
        } catch { active = { ...active, cacheWarning: 'invalid_cache' }; }
      }
    } catch { active = { ...active, cacheWarning: 'storage_unavailable' }; }
    loaded = true;
    return active;
  }
  async function refreshInternal(): Promise<RailRefreshResult> {
    await loadInternal();
    let stagedVersion: string | undefined;
    let failure: RailFailure = 'network';
    try {
      const manifestBytes = await fetchRailBytes(`${RAIL_DATA_URL}manifest.json`, MANIFEST_LIMIT, fetcher, dependencies.timeoutMs);
      const manifest = inspectRailManifest(manifestBytes);
      const snapshot: RailSnapshotBytes = { manifest: manifestBytes, files: {} as RailSnapshotBytes['files'] };
      for (const id of RAIL_LINE_IDS) snapshot.files[id] = await fetchRailBytes(`${RAIL_DATA_URL}${id}.json`, manifest.entries[id].bytes, fetcher, dependencies.timeoutMs);
      failure = 'invalid_data';
      const verified = await verifyRailSnapshot(snapshot, sha256);
      if (olderThanCurrent(verified.bundle)) throw new RailRefreshError('older_snapshot');
      if (verified.manifestHash === active.manifestHash) return { status: 'unchanged', active };
      failure = 'storage';
      const versions = (await storage.listVersions()).filter((key) => VERSION_PATTERN.test(key));
      const sequence = versions.reduce((max, key) => Math.max(max, Number(VERSION_PATTERN.exec(key)![1])), 0) + 1;
      const nonce = dependencies.nonce();
      if (sequence > 999_999_999_999 || !/^[a-f0-9]{32}$/.test(nonce)) throw new RailRefreshError('storage');
      stagedVersion = `v1-${String(sequence).padStart(12, '0')}-${verified.manifestHash}-${nonce}`;
      const receipt: RailReceipt = { format: 1, manifestHash: verified.manifestHash, refreshedAt: (dependencies.now?.() ?? new Date()).toISOString() };
      await storage.stage(stagedVersion, snapshot, receipt);
      await readVersion(stagedVersion, true);
      await storage.commit(stagedVersion);
      const committed = await readVersion(stagedVersion);
      active = committed;
      return { status: 'updated', active };
    } catch (error: unknown) {
      if (stagedVersion) { try { await storage.discardStage(stagedVersion); } catch { /* Leave incomplete staging ignored on restart. */ } }
      const reason = error instanceof RailRefreshError ? error.kind : failure;
      return { status: 'failed', active, reason, message: new RailRefreshError(reason).message };
    }
  }
  return {
    load: () => serialize(loadInternal),
    refresh: () => {
      if (!refreshing) {
        refreshing = serialize(refreshInternal);
        void refreshing.then(() => { refreshing = undefined; }, () => { refreshing = undefined; });
      }
      return refreshing;
    },
  };
}
