import type { RailSnapshotBytes } from './railSnapshot';

export type RailCacheFile = 'manifest.json' | 'lrt1.json' | 'lrt2.json' | 'mrt3.json' | 'receipt.json';
export const VERSION_PATTERN = /^v1-(\d{12})-([a-f0-9]{64})-([a-f0-9]{32})$/;
export type RailReceipt = { format: 1; manifestHash: string; refreshedAt: string };

/** Only importer-owned version keys/files may be accessed by the platform adapter. */
export interface RailStorage {
  listVersions(): Promise<string[]>;
  read(version: string, file: RailCacheFile, limit: number, staged?: boolean): Promise<Uint8Array>;
  stage(version: string, snapshot: RailSnapshotBytes, receipt: RailReceipt): Promise<void>;
  commit(version: string): Promise<void>;
  discardStage(version: string): Promise<void>;
}
