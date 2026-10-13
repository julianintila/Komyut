# Local Rail Data - Task 1

This pure TypeScript module is separate from fictional samples, the existing
Laravel client, UI, storage and networking. Task 1 includes only a bundled
baseline, structural validation, station/operator mapping, and same-line
source-recorded ticket base derivation. It does not require PostgreSQL.

## Bundled Baseline and License

`data/2026-10-07/` contains unchanged original bytes of manifest.json, lrt1.json,
lrt2.json and mrt3.json from https://trainsph-data.web.app/. These were copied
from the previously inspected repository snapshots without editing the API.
The baseline includes 25 LRT-1, 13 LRT-2 and 13 MRT-3 station IDs.

Fare and station data: TrainsPh (https://trains.ph), CC BY 4.0

License: https://creativecommons.org/licenses/by/4.0/
Published data documentation: https://trains.ph/data/

Komyut transforms the data into typed station/operator records and ticket-base
estimates. No endorsement by TrainsPh or transport operators is implied. Preserve
attribution, source links, license link and original provenance when displaying
or redistributing data. Other manifest entries have different licenses; they
are not bundled or processed here. Original line files retain ignored fields,
but no interchange/transfer graph, service hours or runtime prediction is built.

The manifest's SHA-256 is pinned as BUNDLED_RAIL_MANIFEST_SHA256. Node integrity
tests hash each original file and check its exact byte length against the
manifest. Runtime JSON imports already contain parsed objects, so
validateRailBundle performs structural validation, NOT original-byte hashing.
Network/cache acceptance separately verifies original bytes before calling this
validator; see persistence/README.md for Task 2. Task 1 added no native dependency.
A matching hash establishes consistency only, not authenticity or current fares.

## API and Validation

- `loadBundledRailData()` returns a fresh validated projection without I/O.
- `validateRailBundle(manifest, files)` accepts unknown parsed JSON and validates
  schema version 1, reviewed line/operator identity, manifest metadata, license,
  source dates, IDs, names, coordinate bounds, ordinal order, reference integrity,
  fare matrices/bands, known ticket formulas and non-stacking source modifiers.
- Validation errors throw RailDataValidationError naming the invalid field.
- RailStation conforms to TransportStop and can use existing local search.
  IDs are unchanged; full names/aliases and coordinate claims are retained.
  No stations are merged by name/coordinates, and no reverse route is inferred.
- Operators use trainsph-lrmc, trainsph-lrta and trainsph-dotr-mrt3.

Source generation, fare effective dates, fare verification claims and coordinate
verification claims remain separate. `independentlyVerified` is always false;
TransportDataSource.verifiedOn is omitted. These files report source fare checks
on 2026-09-18 and coordinate checks on 2026-09-20, not Komyut verification.

## Base Fare Derivation

`deriveRailBaseFare(bundle, request, maxSourceAgeDays = 30)` requires a validated
bundle, exact station IDs, beep or single_journey, and an explicit Philippine
calendar date in YYYY-MM-DD format. Dates are not inferred from the device clock.

LRT-1/LRT-2 read the aligned stored-value matrix. Single Journey rounds that base
up to a PHP 5 increment. MRT-3 selects the highest matching min_span using the
absolute station ordinal difference, NOT kilometres; both tickets share a base.
Money is nonnegative safe integer centavos. Known formulas are implemented
explicitly, never evaluated as source code. Reverse fare lookup is supported by
the checked symmetric matrices/span model; this does not create reverse routes.

Same-station, unknown-station and cross-line requests are refused. Dates before
the base fare's effective date are refused. Freshness is measured from the source
verification claim, with a configurable 30-day default: recent_source_claim,
stale, or not_yet_verified_by_source. This is a product safeguard, NOT a published
TrainsPh update schedule or proof that a fare is still valid.

Successful results are deliberately named source_base_estimate and use
baseFareCentavos, not amountCentavos. currentlyPayableCentavos is always null.
Source modifiers applicable by date/line/selection are exposed with their own
freshness but are NEVER applied, including the temporary automatic discount.
policyStatus is unavailable_unverified_source. Claimed IDs do not prove
eligibility. Do not display the undiscounted base as the currently payable fare.

Task 1 does not implement discounted estimates, percentage application, modifier
rounding, cross-line totals or transfers. The general fare engine and its policy
verification restrictions remain unchanged. More fare-policy behavior requires
the separately approved fare-engine task and reviewed verification semantics.

## Checks and Next Boundaries

```powershell
npm run check:rail
node --test scripts/*.test.cjs
npx --no-install tsc --noEmit
```

The tests check baseline byte integrity, malformed records, mapping, matrix and
band derivation, effective-date boundaries, source freshness, unavailable
discounts/payable amounts and source isolation. Compile-only rail.type-test.ts
checks the public contracts. No PostgreSQL tests are needed for this module.

Task 2 (persistent caching/refresh) is implemented separately under persistence/;
its README describes safety controls, dependencies, checks and native limitations.
Task 3 (additional fare-engine coverage) and Task 4 (UI integration) are not started.
App screens continue using their existing data sources. Native rendering/runtime
integration remains unverified here.

Task 1 results: 41 rail tests and all 162 mobile tests passed, with zero failures
or skips; TypeScript passed. Expo dependency compatibility exits 1 recommending
57.0.28 instead of installed 57.0.27; no dependency was changed for that existing
warning. Mobile lint remains unavailable because it has no lint configuration.
