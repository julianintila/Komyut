# Development Roadmap

## Goal

Build a Philippine Commuter Guide that helps users find public transportation
fares, terminals, stations, and step-by-step routes.

This is the authoritative development roadmap. Implement one brick per task,
stop after each brick, and wait for explicit approval before continuing.

## Phase 1 - Foundation

1. Project initialization and documentation.
2. Design tokens and basic styling conventions.
3. Mobile navigation.
4. Initial route-search screen.

## Phase 2 - Transport Data

5. Define stop, terminal, operator, and route models.
6. Create a small, clearly labeled sample dataset.
7. Implement stop and terminal search.

## Phase 3 - Fare Calculation

8. Implement configurable fare rules with source and verification metadata.
9. Calculate regular and eligible discounted fares with tests.

## Phase 4 - Route Finding

10. Find direct routes.
11. Support transfers and total fare estimates.
12. Add maps and supported walking directions.

## Phase 5 - Backend

13. Initialize the Laravel API.
14. Create the PostgreSQL schema.
15. Connect the mobile application to the API.

## Phase 6 - Web and Operations

16. Build the public route-search website using Next.js.
17. Build an admin interface for managing transport data.
18. Prepare deployment, monitoring, backups, and release checks.

## Brick 1 - Project Initialization

1. Check the installed Node.js and npm versions.
2. Initialize the standard Expo TypeScript application under `apps/mobile/`.
3. Keep the initial Expo project structure as close to the standard template as possible.
4. Ensure the application starts successfully.
5. Verify TypeScript configuration and available project checks.
6. Document Windows setup and run instructions in the README.
7. Record the planned architecture and all remaining bricks in the documentation.

Do not initialize the Next.js website or Laravel backend yet. Do not build app
screens, maps, fare calculations, authentication, databases, or other features.
If a setup command fails, investigate and report the issue. At completion,
report files created, commands and checks executed, actual results, and remaining
issues. Brick 2 requires explicit approval.

## Progress

Bricks 1 through 15 are implemented. Brick 14 uses the permitted definition-only
path; Brick 15's successful database fetching/device behavior remains unverified.
See the README for actual verification results and
the architecture document for styling, navigation, form, and transport-model
conventions. Brick 11 confirmed the models, sample data, direct-route finder, and
fare calculator, then added bounded directed journeys and shared-ID transfers.
Explicit segment-to-rule bindings reuse the fare calculator; complete totals
require every segment to be calculable. Unknown/incomplete estimates have no
total. Home shows ordered segments, transfers, and honest fare status with sample
labels. All 92 tests, TypeScript, isolated ES2020 compilation, Expo compatibility,
and all 21 Expo Doctor checks passed. Android/iOS bundles returned HTTP 200.
No actual fares or new transport records were added. Brick 12 adds stop location
details in Search with the documented external Google Maps fallback, validated
coordinates and encoded walking URLs, no new dependency or native configuration.
The coordinate-free fictional dataset produces honest unavailable messages.
All 104 tests, TypeScript, Expo dependency compatibility, and all 21 Doctor checks
passed; Android/iOS bundles returned HTTP 200. Brick 12 introduced no embedded map,
invented geometry, GPS, backend, or website.

Brick 13 adds an API-only Laravel 12.69.3 application in `apps/api/`, using the
available PHP 8.2.12 and Composer 2.8.11. Its only HTTP route, `/api/health`, returns
the documented JSON without a database connection. Safe environment placeholders
and ignored private settings, PHPUnit tests, and Windows setup are documented.
No migrations, database files, auth packages, transport endpoints, website, or
mobile integration were added. Four Laravel tests (19 assertions), Pint, PHP
syntax, Composer validation/platform checks, and the Composer audit passed.
A real loopback request returned HTTP 200 and exact health JSON. Mobile TypeScript
and all 104 existing tests passed; all 51 source/config file hashes are unchanged.
The verification API server was stopped. Laravel 12 receives security fixes only
until February 24, 2027; the runtime/framework upgrade decision is documented.

Brick 14 adds one reversible PostgreSQL-only migration, seven related Eloquent
models, safe environment placeholders, and schema documentation. Money uses
integer centavos; unknown fares have no amount. Ordered route stops, restrictive
foreign keys, coordinate ranges, fare variants, and provenance are defined.
Thirteen database-independent Laravel tests passed (94 assertions), as did PHP
syntax, Pint, Composer validation, mobile TypeScript, and all 104 mobile tests.
All 22 native PostgreSQL tests were skipped: `pdo_pgsql` is unavailable, and no
real PostgreSQL connection or migration was attempted. SQL compilation is not
proof of native integrity/persistence. The private environment and mobile hashes
are unchanged; no endpoints, seed data, database reset, or mobile integration
were added. Live verification remains required before relying on this schema.

Brick 15 adds only read-only stops/routes endpoints, a centralized typed mobile
client, and opt-in API search with clear source labels, retry, empty states, and
sample fallback. Home's fictional planning remains intact. All 121 mobile tests
and TypeScript passed; 21 Laravel tests passed (135 assertions), with 25 native
PostgreSQL tests skipped because pdo_pgsql is still absent. PHP syntax, Pint and
Composer validation passed; Android/iOS bundles returned 200. Actual HTTP checks
confirmed health 200, sanitized transport 503 and invalid-limit 422. The typed
client also handled that real 503. Positive list contracts are verified only
using mocked records, not a real PostgreSQL instance. Expo compatibility check
exits 1 recommending patch 57.0.28 instead of installed 57.0.27; dependencies were
not updated for this unrelated warning. No data seeding, migrations, auth, new
planning/fare logic, or website was added. These limits are documented.

Supplemental approved rail-import task: phase-one TrainsPh stations, operators
and canonical-order routes are implemented using pinned, attributed snapshots,
default preview, explicit local-target confirmation, ownership checks and
transactional locking. No schema, mobile, fare or transfer feature was changed.
A real PostgreSQL dry-run proposed 51 stops, 3 operators, 3 train associations,
3 routes and 51 route stops; all seven tables remained unchanged. No apply was
executed. Ten parser/command tests passed; ten importer transactional tests are
blocked by unconfirmed dedicated test database/role and missing private test
credentials/opt-in. Full Laravel checks passed 32 tests (370 assertions) with
35 native tests skipped. Pint, PHP syntax, Composer validation, all 121 mobile
tests and TypeScript passed. Importer apply verification remains pending; this
supplemental task does not mark the original Next.js Brick 16 complete.

Approved local-first mobile rail integration, Task 1: completed independently.
The separate rail module bundles the four unchanged baseline JSON snapshots,
validates source structure/provenance and station references, maps 51 stations
and three operators, and derives same-line source-recorded ticket bases.
Unverified modifiers are exposed but never applied; currently payable prices
remain unavailable. Original-byte integrity tests do not imply authenticity or
fare freshness. All 41 new rail tests and all 162 mobile tests passed with no
skips, as did TypeScript. Expo compatibility still recommends 57.0.28 over
installed 57.0.27; dependencies were not changed. No backend, importer, existing
API client, samples or screen behavior was modified. Task 2 (persistent cache
and refresh), Task 3 (additional fare-engine tests), and Task 4 (minimal UI)
remain pending and each requires explicit approval. This does not initialize
or complete the original roadmap's Next.js website brick.

User-designated Brick 18 / local-first Task 2: offline persistence and safe
explicit refresh are implemented separately from UI. SDK 57 file-system/crypto
adapters support durable versioned documents storage, original-byte hashing,
bounded HTTPS streaming, staged complete-bundle activation and startup recovery.
All 65 focused rail tests and all 186 mobile tests passed with zero skips, as did
TypeScript. Expo compatibility still flags the existing 57.0.28 recommendation;
Expo was not upgraded. Physical-device persistence remains unverified. No backend,
database/importer, existing Laravel client, screens, samples or fare-policy logic
changed. Task 3 and Task 4 remain pending and require explicit approval. This
supplemental numbering does not initialize/deploy the original website brick.

Mobile lint remains unavailable because it has no lint configuration. Native
device rendering, measured safe-area/keyboard behavior, and screen-reader
announcements remain unverified; native hosts and React hooks are stubbed in
the wiring checks. External map launching has not been verified on a device.
The original website/admin/deployment bricks 16 through 18 remain pending;
the supplemental user-numbered rail tasks do not complete those web milestones.

User-designated Brick 19: local-first rail UI integration is implemented as an
explicit Train stations mode in Search. A lazy session repository loads/revalidates
local data on first rail-mode mount; refresh is manual and failures keep the last
valid data visible. Station selection is same-line only and rejects identical
stations. Stored-value/Single Journey source base estimates retain null payable
amounts and apply no discounts. Attribution, bundled/persisted origin, source
freshness and separate generation/verification/effective/download dates are shown.
All 196 mobile tests (71 focused rail) passed with zero failures/skips and
TypeScript passed; Android and iOS Metro bundles returned HTTP 200. Expo
compatibility still exits 1 for the existing 57.0.28 recommendation; no package was
upgraded. Native device layout/offline behavior is not verified by mocked tests.
No backend, PostgreSQL, importer, Home samples, existing API client or navigation
change was introduced. Stop here; further work requires explicit approval.

Approved Home follow-ups retain Home only in visible navigation, with real API
stop/rail suggestions and side-by-side ticket base estimates. Technical details
are hidden from the active screen; dormant features remain in the repository.
The separately approved timing addition shows sourced reported train intervals,
not live arrivals. A validated offline snapshot expires 30 days after its own
source verification claim and falls back to Timing unavailable. All 211 mobile
tests and 78 focused rail tests passed with no failures/skips; TypeScript passed.
The existing Expo patch warning remains. Device and real-world accuracy checks
remain unverified. No deployment, live feed, background refresh, backend or fare
policy change is made. Stop for approval before further implementation.
