import type { RailBundle, RailLineId } from '../types';
import { isRailDate, RAIL_ATTRIBUTION, RAIL_LICENSE_URL, RAIL_LINE_IDS, RailDataValidationError, validateRailBundle } from '../validateRailBundle';

export const MANIFEST_LIMIT = 128 * 1024;
export const DATASET_LIMIT = 512 * 1024;
export const RECEIPT_LIMIT = 2048;
export const RAIL_DATA_URL = 'https://trainsph-data.web.app/';
export type RailFailure = 'network' | 'timeout' | 'size_limit' | 'hash_mismatch' | 'invalid_data' | 'storage' | 'older_snapshot';
export class RailRefreshError extends Error {
  constructor(public readonly kind: RailFailure) {
    super(`Rail data refresh failed: ${kind}. The previous dataset is retained.`);
    this.name = 'RailRefreshError';
  }
}
export type Sha256 = (bytes: Uint8Array) => Promise<string>;
export type RailSnapshotBytes = { manifest: Uint8Array; files: Record<RailLineId, Uint8Array> };
export type RailManifest = {
  generatedOn: string;
  entries: Record<RailLineId, { sha256: string; bytes: number }>;
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RailRefreshError('invalid_data');
  return value as Record<string, unknown>;
}
export function parseRailJson(bytes: Uint8Array, limit: number): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > limit) throw new RailRefreshError('size_limit');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new RailRefreshError('invalid_data'); }
}
export function inspectRailManifest(bytes: Uint8Array): RailManifest {
  const manifest = object(parseRailJson(bytes, MANIFEST_LIMIT));
  const license = object(manifest.license);
  if (manifest.schema_version !== 1 || !isRailDate(manifest.generated_on)
    || license.id !== 'CC-BY-4.0' || license.url !== RAIL_LICENSE_URL || license.attribution !== RAIL_ATTRIBUTION
    || !Array.isArray(manifest.lines) || manifest.lines.length !== 3) throw new RailRefreshError('invalid_data');
  const entries = {} as RailManifest['entries'];
  for (const value of manifest.lines) {
    const entry = object(value);
    if (!RAIL_LINE_IDS.includes(entry.id as RailLineId) || entries[entry.id as RailLineId]
      || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || typeof entry.bytes !== 'number' || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > DATASET_LIMIT) {
      throw new RailRefreshError('invalid_data');
    }
    entries[entry.id as RailLineId] = { sha256: entry.sha256, bytes: entry.bytes };
  }
  return { generatedOn: manifest.generated_on, entries };
}
export async function verifyRailSnapshot(snapshot: RailSnapshotBytes, sha256: Sha256, expectedManifestHash?: string): Promise<{ bundle: RailBundle; manifestHash: string }> {
  const manifest = inspectRailManifest(snapshot.manifest);
  const manifestHash = await sha256(snapshot.manifest);
  if (!/^[a-f0-9]{64}$/.test(manifestHash) || expectedManifestHash && manifestHash !== expectedManifestHash) throw new RailRefreshError('hash_mismatch');
  const values = {} as Record<RailLineId, unknown>;
  for (const id of RAIL_LINE_IDS) {
    const bytes = snapshot.files[id];
    if (!bytes || bytes.byteLength !== manifest.entries[id].bytes || await sha256(bytes) !== manifest.entries[id].sha256) {
      throw new RailRefreshError('hash_mismatch');
    }
    values[id] = parseRailJson(bytes, DATASET_LIMIT);
  }
  try {
    return { bundle: validateRailBundle(parseRailJson(snapshot.manifest, MANIFEST_LIMIT), values), manifestHash };
  } catch (error: unknown) {
    if (error instanceof RailDataValidationError) throw new RailRefreshError('invalid_data');
    throw error;
  }
}
