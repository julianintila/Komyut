# Rail Persistence and Refresh - Task 2

This layer provides explicit local load/refresh operations, separate from screens.
It uses the existing pure rail validator and preserves base-fare/policy behavior.
No Laravel endpoint, PostgreSQL access, transfer graph or background job is used.

## Modules

- railSnapshot.ts: bounded UTF-8 JSON parsing, manifest inspection and original
  byte SHA-256 checks before line parsing/full-bundle validation.
- fetchRailBytes.ts: fixed-origin HTTPS fetch, streamed byte bounds and a deadline
  covering response headers and body, even if a transport ignores abort.
- railStorage.ts: small injected storage contract and safe version/file names.
- createRailRepository.ts: startup selection, serialized explicit refresh,
  staging/readback verification, activation and safe failure results.
- expoRailStorage.ts: SDK 57 Directory/File API in durable documents storage.
- expoRailRepository.ts: SDK 57 expo/fetch streaming, expo-crypto SHA-256 over
  original bytes, and random candidate IDs. It is intentionally NOT exported by
  the pure rail index. Brick 19 uses a lazy singleton via ui/railRepository.ts.

Brick 19 initializes this repository when the separate rail Search mode mounts,
not at application import. The hook calls load(); the repository revalidates its
cache once per application session. Refresh remains explicit only. Direct usage:

```typescript
import { createExpoRailRepository } from './expoRailRepository';

const repository = createExpoRailRepository();
const startup = await repository.load();
const result = await repository.refresh();
```

Constructing the repository performs no network or file writes. load() revalidates
persisted raw bytes/manifest hash, hashes, schema, references and provenance. It
returns the latest valid committed version, an older valid version if needed,
or the bundled baseline. Corruption/storage problems produce cacheWarning.
No cache exists on first launch; bundled data works without network or writes.

## Durable Commit Protocol

Root: Paths.document/komyut-rail-v1 (not the purgeable OS cache directory).
Each immutable version directory is named:

`v1-{12-digit sequence}-{manifest SHA-256}-{32-hex nonce}`

It contains original manifest.json, lrt1.json, lrt2.json, mrt3.json and receipt.json.
The receipt records format 1, the manifest hash and a separate refreshedAt timestamp.
No secrets or credentials are stored. Source verification/effective dates are
never rewritten as fetch dates, and freshness is never reset merely by download.

Refresh stages in pending-{version}, validates the bytes read back from disk,
then moves the complete directory to its committed name and revalidates it before
assigning the active dataset. There is no active-pointer file overwritten in place.
Incomplete pending directories are never candidates. Partially moved/corrupted
committed directories also cannot activate because startup validates every file.
Failure preserves the previous in-memory dataset and earlier committed versions.

This is logical whole-bundle activation. Physical power-loss/fsync behavior and
real device filesystem operations remain unverified; recovery can fall back to
an earlier complete version or baseline. Only owned pending directories are
cleaned after failure. Earlier versions and crash-left staging are retained;
automatic retention/garbage collection is not introduced in this task.

Use one repository instance: its load/refresh operations serialize, and concurrent
refresh callers share one promise. Native candidate nonces also avoid path
collisions. There is no cross-process locking or multi-process writer workflow.

## Refresh Safety

Only https://trainsph-data.web.app/manifest.json and the three fixed line filenames
are requested. Credentials are omitted and redirects are refused. Defaults:

- 10 seconds per request, including body streaming (four sequential requests).
- 128 KiB manifest, 512 KiB per line, 2 KiB receipt.
- Declared byte counts/hashes must be valid before requesting line files.
- Streaming enforces bounds regardless of misleading/missing Content-Length.
- Original bytes must match manifest lengths and SHA-256 before JSON parsing.
- The complete bundle must pass the existing rail schema validation.
- Older manifest or per-line generation/verification claims cannot replace newer
  active data. Each line's own generation date may precede the manifest date.

After validation, unchanged manifest content returns unchanged without rewriting
files/receipts. Other successes return updated only after commit and readback.
Failures return failed with a safe reason/message and the previous active data.
No raw server response, private diagnostic or credentials are returned to UI.

The manifest comes from HTTPS, not a signed trust chain. Matching hashes prove
consistency with that manifest, NOT authenticity, official approval or current
fares. Attribution/license and source claims remain intact. Discounts remain
unavailable_unverified_source and currentlyPayableCentavos stays null.

## Dependencies and Verification

Added with `npx expo install expo-file-system expo-crypto` using SDK 57's installed
compatibility map. Installed file-system 57.0.7 and crypto 57.0.4; requested ranges
are ~57.0.7 and ~57.0.3. Both modules are included in Expo Go for SDK 57.
Expo remains 57.0.27. Its compatibility check recommends ~57.0.28, but the selected
SDK 57 APIs/packages do not impose a newer Expo peer requirement. No Expo upgrade
or broad dependency fix was performed. The installer reported 22 npm audit
vulnerabilities (7 moderate, 15 high); no audit fix was applied.

```powershell
npm run check:rail
node --test scripts/*.test.cjs
npx --no-install tsc --noEmit
npx --no-install expo install --check
```

Results: 65 focused rail tests and all 186 mobile tests passed, zero failures/skips;
TypeScript passed. Expo compatibility exits 1 for the existing patch recommendation.
Lint remains unconfigured. Tests use deterministic local snapshots, mocked network,
memory storage and SDK-shaped native adapters; no live server is required.
Real iOS/Android persistence, app termination and device-offline behavior remain
to be tested on a device. Task 2 itself changed no screen; Brick 19 separately
connects this repository to rail Search without altering persistence internals.

SDK references:
https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
https://docs.expo.dev/versions/v57.0.0/sdk/crypto/
