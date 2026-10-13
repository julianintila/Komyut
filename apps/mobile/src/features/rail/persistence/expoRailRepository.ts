import * as Crypto from 'expo-crypto';
import { fetch } from 'expo/fetch';
import { createRailRepository } from './createRailRepository';
import { createExpoRailStorage } from './expoRailStorage';
import type { RailRepository } from './createRailRepository';

/** Instantiate once when rail UI integration is approved; no automatic fetch or background work. */
export function createExpoRailRepository(): RailRepository {
  return createRailRepository({
    storage: createExpoRailStorage(), fetcher: fetch,
    sha256: async (bytes) => {
      const digest = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
      return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
    nonce: () => Crypto.randomUUID().replace(/-/g, ''),
  });
}
