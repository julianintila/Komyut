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
UI integration is implemented in the separately approved Brick 19, below.
Additional fare-policy behavior remains deferred. Native rendering/runtime
integration remains unverified here.

Task 1 results: 41 rail tests and all 162 mobile tests passed, with zero failures
or skips; TypeScript passed. Expo dependency compatibility exits 1 recommending
57.0.28 instead of installed 57.0.27; no dependency was changed for that existing
warning. Mobile lint remains unavailable because it has no lint configuration.

## Brick 19 - Rail Search UI

Search has an explicit Train stations entry, separate from sample/API stops.
RailSearchScreen uses ui/useRailData.ts and a lazy session-scoped repository in
ui/railRepository.ts. First opening rail mode calls load() to revalidate persisted
data or select the bundled fallback. Returning to rail mode reuses the repository;
there is no automatic network refresh. Refresh rail data is an explicit action,
and the previous dataset remains usable during refresh or failure.

Station names, full names and aliases are searchable. Choosing From restricts To
to the same line; identical stations are rejected. Changing From to another line
clears an incompatible To. Ticket selection uses the existing pure fare derivation
with the current Philippine calendar date. UI state is local and not persisted.

Estimates display the ticket base, not the currently payable fare; no modifier is
applied. Source freshness warnings, line generation, source verification claims,
base effective date, manifest generation and download receipt remain separate.
Bundled/persisted status, TrainsPh attribution, license and source URL are shown.
The approved unified Home follow-up now uses rail/API From/To selections;
fictional sample planning is preserved under Search. Home initializes the same
session repository on mount without automatic refresh. API failures never
substitute samples on Home. The existing API client remains unchanged.
RailFareDetails preserves attribution and technical source dates, license,
source links and manual refresh inside an expandable details view. The main
screen has no baseline label, attribution URL block or update action.
Estimate disclaimers and freshness warnings remain
visible. API/mixed-source route planning remains unsupported.

Focused checks include scripts/rail-ui.test.cjs and scripts/navigation.test.cjs.
The latter inspects element/event wiring with native hosts stubbed, not pixels.
Physical-device layout, screen-reader output and real filesystem recovery still
need verification. No transfers, cross-line fares or journey times are introduced.

Brick 19 verification: 71 focused rail tests, 23 navigation/UI/lifecycle checks
(overlapping the rail suite), and all 196 mobile tests passed with no skips.
TypeScript and git diff --check passed; Android/iOS Metro bundles returned 200.
Expo compatibility retains the existing patch warning; lint is not configured.

Historical Brick 19 device checklist (Search is now hidden): search Recto, choose it as From,
choose Antipolo as To, and switch between Stored value and Single Journey. Check
the base-fare disclaimer, individual source dates and attribution. Choose the
same station twice to check validation; change From to another line to check To
is cleared. Test airplane mode on first launch, failed refresh with stations still
available, and restart after a successful refresh to check persisted status.
Check a small screen with the keyboard open, larger text and a screen reader.
Return to Sample / API stops and verify the other tabs still behave as before.

## Approved Reported Train Intervals

The active Home screen has only From/To search and adjacent base-fare columns.
Search/Nearby/Saved remain dormant. Technical fare details and ticket selection
are not shown on Home; source credit/license links and important warnings remain.

timing/reportedRailInterval.ts adds a separate, framework-independent interval
lookup. timing/data/2026-10-14/ contains unchanged headways.json and manifest.json
downloaded on 2026-10-14 from https://trainsph-data.web.app/. The manifest was
generated on 2026-10-13; the timing file and its source verification claims are
2026-10-07. These dates are not rewritten to the download date.

Published intervals normalize to about 4 minutes for LRT-1, 13 for LRT-2 and 9
for MRT-3. Original notes explain the source's normalization of reported figures.
Underlying sources include Philstar's 2026-07-20 report and DOTr-MRT3's
2025-11-20 modernization statement. These remain publisher claims, not independent
Komyut verification or proof of current service. Original source URLs/notes are
retained in the snapshot. The TrainsPh data page states CC BY 4.0 reuse terms
(with separate exceptions); the manifest declares CC-BY-4.0 and has no headway
license override. Credit remains TrainsPh with the license/source links.

The original 2888 timing bytes match the manifest SHA-256
c93f9cd11e5d93d4d9a5f593522e9ff6479c6bd841cf180bf00d8130e6f0779d.
Tests verify original-byte integrity; runtime JSON imports are structurally
validated. Matching hashes establish consistency, not authenticity or freshness.

Schema, provenance, HTTPS URLs, clock bands, overlap and interval bounds are
validated. Invalid/missing data, unsupported lines, future dates and claims older
than 30 days return unavailable. Thirty days is a conservative product cutoff,
not an operator update schedule or a guarantee of validity. A fresh download or
new manifest does not reset source age. The current snapshot expires after
2026-11-06 unless replaced with reviewed data in a later approved update.

Home shows Reported train interval: about N min / Not live. Service intervals vary.
Missing/outdated timing shows Timing unavailable while fares keep working.
The function returns isLive false and nextArrivalAt null. It summarizes intervals
across published bands, never calculates a countdown, asserts service is currently
open, predicts arrival/travel duration, or derives a departure from operating hours.
Peak/off-peak variations, holidays, disruptions and platform-specific arrivals
are not known. Different band values produce a reported range, not a chosen ETA.

This snapshot works offline, separately from the existing persisted fare bundle.
It is not automatically downloaded/refreshed by that repository. No cache format,
fare policy, API client, backend, dependency, or background operation is changed.
Tests use fixed calendar dates, local snapshots and synthetic invalid candidates.
Device layout and real-world interval accuracy remain unverified.
