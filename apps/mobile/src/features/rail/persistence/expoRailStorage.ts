import { Directory, File, Paths } from 'expo-file-system';
import { DATASET_LIMIT, MANIFEST_LIMIT, RECEIPT_LIMIT, RailRefreshError } from './railSnapshot';
import type { RailSnapshotBytes } from './railSnapshot';
import { VERSION_PATTERN } from './railStorage';
import type { RailCacheFile, RailReceipt, RailStorage } from './railStorage';

export function createExpoRailStorage(): RailStorage {
  const root = new Directory(Paths.document, 'komyut-rail-v1');
  function directory(version: string, staged = false): Directory {
    if (!VERSION_PATTERN.test(version)) throw new RailRefreshError('storage');
    return new Directory(root, staged ? `pending-${version}` : version);
  }
  return {
    async listVersions() {
      if (!root.exists) return [];
      return root.list().filter((entry): entry is Directory => entry instanceof Directory && VERSION_PATTERN.test(entry.name)).map((entry) => entry.name);
    },
    async read(version: string, name: RailCacheFile, limit: number, staged = false) {
      if (!['manifest.json', 'lrt1.json', 'lrt2.json', 'mrt3.json', 'receipt.json'].includes(name)) throw new RailRefreshError('storage');
      const file = new File(directory(version, staged), name);
      if (!file.exists || file.size <= 0 || file.size > limit) throw new RailRefreshError('storage');
      const bytes = await file.bytes();
      if (bytes.byteLength > limit) throw new RailRefreshError('size_limit');
      return bytes;
    },
    async stage(version: string, snapshot: RailSnapshotBytes, receipt: RailReceipt) {
      root.create({ idempotent: true, intermediates: true });
      const pending = directory(version, true);
      pending.create();
      const files = { 'manifest.json': snapshot.manifest, 'lrt1.json': snapshot.files.lrt1, 'lrt2.json': snapshot.files.lrt2, 'mrt3.json': snapshot.files.mrt3,
        'receipt.json': new TextEncoder().encode(JSON.stringify(receipt)) };
      for (const [name, bytes] of Object.entries(files)) {
        const limit = name === 'manifest.json' ? MANIFEST_LIMIT : name === 'receipt.json' ? RECEIPT_LIMIT : DATASET_LIMIT;
        if (bytes.byteLength > limit) throw new RailRefreshError('size_limit');
        const file = new File(pending, name);
        file.create();
        file.write(bytes);
      }
    },
    async commit(version: string) {
      const target = directory(version);
      if (target.exists) throw new RailRefreshError('storage');
      await directory(version, true).move(target);
    },
    async discardStage(version: string) {
      const pending = directory(version, true);
      if (pending.exists) pending.delete();
    },
  };
}
