# Komyut

A Philippine Commuter Guide for finding public transportation fares, terminals,
stations, and step-by-step routes.

Bricks 1 through 15 provide documentation, typed design tokens, four-tab
navigation, a local commute form, transport models, a fictional dataset, and
local stop/terminal search, configurable fare rules, and a pure calculation engine.
Home now finds direct and transfer journeys in the fictional sample dataset.
The planner supports explicit segment fare assignments, but no application fare
data is configured, so displayed totals are unknown. Search offers stop location
details with validated external map/walking links; current fictional stops have
no coordinates, so these actions are unavailable. A separate Laravel API now
provides health and read-only stop/route endpoints. Search has an opt-in typed API
connection with loading, empty, retry and explicitly labeled sample fallback.
The PostgreSQL transport/fare schema is defined, but live database execution
remains unverified because the local PHP PostgreSQL driver is unavailable.
Further development remains in
[the roadmap](docs/roadmap.md).
Development rules are in [AGENTS.md](AGENTS.md), and technology decisions are in
[the architecture document](docs/architecture.md).

## Repository

- `apps/mobile/`: React Native + Expo + TypeScript application.
- `apps/api/`: Laravel 12 API and PostgreSQL schema definitions; [backend setup](apps/api/README.md).
- `docs/`: roadmap and intended architecture.
- Next.js website is deferred. PostgreSQL live
  verification requires the driver and a dedicated local database.

## Windows Setup

Install Node.js LTS (with npm) and Git. The initialization environment has
Node.js `22.20.0` and npm `11.5.2`. Use PowerShell from the repository root:

```powershell
node --version
npm --version
cd apps/mobile
npm ci
npm start
```

Install an Expo Go version compatible with the project's Expo SDK on an Android
device or iPhone, then scan the terminal QR code. Keep the computer and phone
on the same network and allow Node.js through Windows Firewall on the trusted
private network. If LAN access is unavailable, Expo supports `npx expo start
--tunnel`; it may require an additional tunnel dependency and internet access.

For an Android emulator, install Android Studio, configure the Android SDK and
an emulator, start the emulator, then run `npm run android` from `apps/mobile/`.
Local iOS simulator builds require macOS and Xcode; Windows users can use a
physical iPhone with compatible Expo Go. Stop the development server with
Ctrl+C.

## Windows API Setup

PHP and Composer must be available on PATH. Tested with PHP 8.2.12 and Composer
2.8.11; use a patched PHP version supported by Laravel 12. No particular Windows
installation directory is required. From the repository root:

```powershell
cd apps/api
composer install
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
php artisan key:generate
php artisan serve --host=127.0.0.1 --port=8000
```

Generate a key only for a new local installation, not on subsequent startups.
In another terminal, run `Invoke-RestMethod http://127.0.0.1:8000/api/health`.
Expect `{"service":"komyut-api","status":"ok"}` with HTTP 200. No database,
migration, Node frontend build, API key, or authentication is required.
Use another unused port if necessary. Local secrets remain in ignored `.env`.
Production must use separate environment values and `APP_DEBUG=false`.
See [API setup and checks](apps/api/README.md) for requirements and limitations.

## Checks

Run from `apps/mobile/`:

```powershell
npx tsc --noEmit
npx expo install --check
npx expo-doctor
npm run check:navigation
npm run check:route-search
npm run check:sample-data
npm run check:stop-search
npm run check:fares
npm run check:direct-routes
npm run check:journeys
npm run check:maps
npm run check:api
```

Use `npm run` to list scripts. Navigation checks use Node's built-in test runner
without an additional dependency. There is no lint configuration. The web
script is Expo's optional web target, not the planned Next.js website; web
dependencies have not been installed.

`npx tsc --noEmit` also checks `scripts/transport.type-test.ts` and
`scripts/fares.type-test.ts`, including supported types, required configuration,
and expected compile-time rejections. These files are compile-only and must not
be run with Node.

## Brick 7 Verification

Search now filters the five existing fictional sample stops locally. An empty
query lists all eligible stops; unmatched queries show an empty-results message.
Names and optional addresses use case-insensitive partial matching with query
edges trimmed. The terminal-only switch filters stop types, and Clear search
resets text while keeping the filter. Each row retains its Sample name, with
a fictional-data notice in the header. Home, Nearby, and Saved remain unchanged.

| Command or check | Actual result |
| --- | --- |
| `npx --no-install tsc --noEmit` | Passed |
| `node --test scripts/stop-search.test.cjs scripts/navigation.test.cjs scripts/route-search.test.cjs scripts/sample-data.test.cjs` | All 31 tests passed: 9 search, 8 navigation/UI, 8 form, 6 dataset |
| `npx --no-install expo install --check` | Dependencies up to date |
| `npx --yes expo-doctor` | All 21 checks passed |
| `npm start -- --localhost --port 8082` | Metro started in CI mode with isolated temporary Expo settings |
| HTTP GET `/status` on port 8082 | `packager-status:running` |
| Android and iOS bundle requests | Both HTTP 200; Android bundle contains local search and fictional-data labeling |

The dataset has no addresses; tests exercise that optional field using a
fictional test-only fixture. There are no verified travel records, proximity
search, detail navigation, or fares. Native screen layout, keyboard behavior,
and screen-reader behavior still require device testing; UI checks stub hosts
and hooks. Lint remains unavailable. The verification server was stopped after
checks. No dependencies were added; Brick 8 requires explicit approval.

## Initialization

The standard template is generated from the repository root with:

```powershell
npx --yes create-expo-app@latest apps/mobile --template blank-typescript --yes
```

See the official [Expo template documentation](https://docs.expo.dev/more/create-expo/)
and [project setup guide](https://docs.expo.dev/get-started/create-a-project/).
Only one brick is implemented per task. Brick 16 requires explicit approval.

## Brick 12 Verification

In Search, select a stop's Location details. Current records are explicitly
fictional and have no coordinates: the expected result is an unavailable message,
not a pin placed by guessing. Return to the commute form using Home. Configured
valid coordinates enable Google Maps and walking actions labeled outside Komyut.
The provider chooses/asks for the origin; Komyut does not request GPS or promise
walking coverage. No embedded map, API key, extra dependency, or development build
is required. Internet access and an external HTTPS handler/browser are needed.

| Command or check | Actual result |
| --- | --- |
| `node --test --test-reporter=spec scripts/*.test.cjs` | All 104 tests passed after correcting first-reference retention for duplicate map records (initial run: 103 passed, 1 failed) |
| `npx --no-install tsc --noEmit` | Passed |
| `npx --no-install expo install --check` | Dependencies up to date |
| `npx --yes expo-doctor` | All 21 checks passed |
| `npm start -- --localhost --port 8085` | Metro started in CI mode with temporary Expo settings |
| Android/iOS bundle requests | Both HTTP 200; both contain fallback messaging and walking URLs |

No physical device or emulator verification was performed. UI tests stub native
hosts, hooks, and Linking; external launching, layout, and accessibility require
device testing. Lint remains unavailable because no lint configuration exists.
The verification Metro server was stopped after bundling checks.
The dataset, journey algorithms, and fare engine are unchanged. Brick 12's
applicable fallback acceptance checks passed. Brick 13 verification is below.

## Brick 1 Verification

Initialization on 2026-10-12 produced Expo `57.0.27`, React Native `0.86.3`,
React `19.2.3`, and TypeScript `6.0.3`. Application code and configuration retain
the standard blank TypeScript template, including strict TypeScript checking.
The initializer also generated mobile-specific `AGENTS.md` and
`.claude/settings.json`; the mobile agent instructions explicitly defer to the
repository roadmap.

| Command or check | Actual result |
| --- | --- |
| `node --version`, `npm --version` | `v22.20.0`, `11.5.2` |
| `npx --yes create-expo-app@latest apps/mobile --template blank-typescript --yes` | Initial attempt failed on npm cache permissions; retry with temporary npm cache succeeded, installing 477 packages |
| `npx --no-install tsc --noEmit` | Passed |
| `npx --no-install expo install --check` | Initial attempt failed on Expo cache permissions; retry with `EXPO_NO_CACHE=1` passed: dependencies up to date |
| `npx --yes expo-doctor` | Passed all 21 checks |
| `npm run` | Listed `start`, `android`, `ios`, `web`; no lint or test script |
| `npx --no-install expo lint` | Could not run: ESLint is not configured; declined automatic installation to preserve the template |
| `npm start -- --localhost --port 8081` | Metro started successfully in CI mode |
| HTTP GET `/status` on port 8081 | `packager-status:running` |
| HTTP GET `/index.bundle?platform=android&dev=true&minify=false` | HTTP 200, 4,157,317 bytes; starter text present; Metro bundled 738 modules |
| `npm audit --json` | Exit 1: 22 vulnerabilities (7 moderate, 15 high) in the generated dependency tree |

The cache errors were caused by this coding environment's filesystem limits.
The successful retry used these process-local settings in PowerShell:

```powershell
$env:npm_config_cache = Join-Path $env:TEMP 'komyut-npm-cache'
$env:EXPO_NO_CACHE = '1'
$env:__UNSAFE_EXPO_HOME_DIRECTORY = Join-Path $env:TEMP 'komyut-expo-home'
```

The last setting redirects Expo's user settings for the isolated startup check;
it is not needed for normal local development. Startup verification also used
`$env:CI = '1'` to disable interactive prompts and watching. Use a fresh terminal
for normal development.

No dependency audit fixes were applied: the audit proposed major Expo and React
Native downgrades for several findings. The findings remain unresolved. npm also
reported a transitive `uuid@7.0.3` deprecation warning. A physical device or
emulator launch has not been verified; successful Metro startup and Android
bundling do not establish native rendering. The verification server was stopped
after the checks. No future bricks were implemented.

## Brick 3 Verification

The existing entry point now uses React Navigation for Home, Search, Nearby, and
Saved. Home is selected initially; all screens are placeholders. The architecture
document explains the token-based bar, screen layout, and safe-area ownership.

| Command or check | Actual result |
| --- | --- |
| `npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context` | Succeeded; added 19 packages including transitive dependencies |
| `npx --no-install tsc --noEmit` | Passed |
| `npx --no-install expo install --check` | Passed; dependencies up to date |
| `npx --yes expo-doctor` | All 21 checks passed |
| `npm run check:navigation` | All 5 checks passed |
| `npm run` | Confirmed navigation check script; no lint script or configuration |
| `npm start -- --localhost --port 8081` | Metro started in CI mode with temporary Expo settings and API caching disabled |
| HTTP GET `/status` | `packager-status:running` |
| HTTP GET `/index.bundle?platform=android&dev=true&minify=false` | HTTP 200; navigation shell and safe-area provider included |

The navigation checks stub native hosts and navigator mounting, while using the
real tab router for route changes. Physical-device rendering, Android back-button
behavior, and actual notch/gesture-area and enlarged-text layouts have not been
verified. No Android emulator tools were found on PATH. Lint remains unavailable.
Dependency installation still reported 22 audit findings (7 moderate, 15 high);
no audit fixes were applied. The verification server is stopped after checking.

## Brick 4 Verification

Home accepts From and To locations, swaps their values, validates missing or
whitespace-only fields, and shows an honest placeholder for valid submissions.
The examples are placeholder text only; no real routes or fares are returned.
Editing and swapping clear old feedback. Other tabs remain unchanged.

| Command or check | Actual result |
| --- | --- |
| `npm run check:route-search` | All 8 form tests passed |
| `npm run check:navigation` | All 7 navigation and Home wiring checks passed |
| `npx --no-install tsc --noEmit` | Passed |
| `npx --no-install expo install --check` | Passed; dependencies up to date |
| `npx --yes expo-doctor` | All 21 checks passed |
| `npm run` | Confirmed both check scripts; no available lint configuration |
| `npm start -- --localhost --port 8081` | Metro started in CI mode, with the same temporary Expo settings used for prior bricks |
| HTTP GET `/status` | `packager-status:running` |
| Android and iOS bundle requests | Both HTTP 200; Android bundle includes the form, placeholder, and keyboard avoidance |

No dependency was added. Form behavior is tested through the reducer; control
wiring and keyboard configuration are checked with native hosts and React hooks
stubbed. Physical-device layout, actual keyboard avoidance and focus, and
TalkBack/VoiceOver feedback remain unverified. Lint remains unavailable. The
verification server was stopped after the checks. Brick 5 has not been started.

## Brick 5 Verification

`src/features/transport/` contains framework-independent stop, operator, route,
coordinate, and source metadata contracts. There are no transport records or
runtime validators. Home, navigation, dependencies, and configuration are unchanged.

| Command or check | Actual result |
| --- | --- |
| `npx --no-install tsc --noEmit` | Passed, including transport type-contract checks |
| Isolated TypeScript compilation with `types: []` and ES2020 library only | Passed without React, React Native, or Node ambient types |
| `npm run check:route-search` | All 8 tests passed |
| `npm run check:navigation` | All 7 checks passed |
| `npx --no-install expo install --check` | Passed; dependencies up to date |

Lint remains unavailable. Types do not enforce runtime date/coordinate validity
or ID uniqueness and reference integrity; those checks belong at future data
ingestion boundaries. No startup or device check was repeated for these type-only
changes. Brick 6 remains pending explicit approval.

## Brick 8 Verification

The fare feature contains type-only fixed, distance-increment, station-pair, and
unconfigured structures. Amounts use centavos; rules explicitly declare PHP,
vehicle applicability, provenance/reliability, and optional operator/effective
dates. Verified provenance requires a verification date. No fare records or
numeric rate examples were added, and there is no fare calculation.

| Command or check | Actual result |
| --- | --- |
| `npx --no-install tsc --noEmit` | Passed, including fare/transport compile-time contract tests |
| Isolated TypeScript compilation with strict mode, `types: []`, ES2020 library | Fare contracts passed without React, React Native, or Node ambient types |
| `node --test scripts/stop-search.test.cjs scripts/navigation.test.cjs scripts/route-search.test.cjs scripts/sample-data.test.cjs` | All 31 existing runtime tests passed |

Lint is unconfigured. Runtime validation of numbers, dates, source authenticity,
and ID references is deferred until fare data is ingested; types cannot validate
arbitrary external input. No Expo startup/device check was repeated for these
type-only changes. No dependencies, screens, or transport records changed.
Brick 8 acceptance criteria passed; Brick 9 remains pending explicit approval.

## Brick 9 Verification

`calculateFare` accepts an explicit rule, journey, and optional discount request.
It calculates fixed, distance-increment, and directed station-pair fares, or
returns unknown for unconfigured/missing/inapplicable fares. Regular/discounted
results are distinct from invalid journeys/configurations. Rates are supplied
by the caller; no official fare or discount percentage is bundled.

| Command or check | Actual result |
| --- | --- |
| `npm run check:fares` | Initial 19 fare tests passed; two additional edge-case tests were then added |
| `node --test --test-reporter=spec scripts/fare-calculation.test.cjs scripts/stop-search.test.cjs scripts/navigation.test.cjs scripts/route-search.test.cjs scripts/sample-data.test.cjs` | All 52 tests passed, including 21 fare tests |
| `npx --no-install tsc --noEmit` | Passed, including existing compile-time contracts |
| Isolated strict ES2020 TypeScript compilation with `types: []` | Fare engine compiled without React, React Native, or Node ambient types |

See the architecture document for integer-centavo precision, exact distance
fractions, explicit rounding, policy conditions, and error handling. Fare fixture
amounts and simulated verified policy metadata are synthetic unit-test inputs,
not real-world data. Source authenticity, station/operator existence, and
passenger eligibility remain caller responsibilities. BigInt support is required.
Lint remains unconfigured; no Expo startup or device check was repeated because
the engine is not connected to UI. No dependencies or existing screens changed.
Brick 9 acceptance criteria passed. Brick 10 remains pending explicit approval.

## Brick 10 Verification

Home now resolves entered stop names against the existing sample stops and
shows matching direct sample routes in their configured direction. Try From
`Sample Bayan Terminal` to To `Sample Palengke Bus Stop` for one fictional route;
swapping the fields produces no match. `Sample` is ambiguous and requests a more
specific name. Unknown names such as GMA, Cavite or PITX do not imply a real service.
Every result stays labeled as fictional sample data. No fares are displayed.

| Command or check | Actual result |
| --- | --- |
| `npx --no-install tsc --noEmit` | Passed |
| `node --test --test-reporter=spec scripts/direct-routes.test.cjs scripts/fare-calculation.test.cjs scripts/stop-search.test.cjs scripts/navigation.test.cjs scripts/route-search.test.cjs scripts/sample-data.test.cjs` | All 70 tests passed: 14 route/resolution, 21 fare, 9 navigation/UI, 11 form, 6 dataset, 9 stop search |
| `npx --no-install expo install --check` | Dependencies up to date |
| `npx --yes expo-doctor` | All 21 checks passed |
| `npm start -- --localhost --port 8083` | Metro started in CI mode with temporary Expo settings and process-local Expo token removed |
| Android and iOS bundle requests | Both HTTP 200; Android bundle includes route finder and sample warning |

Results preserve existing provenance, include only the requested ordered segment,
and exclude malformed/conflicting route identities and invalid stop/operator
references. There are no transfers or loop-service handling. Fixture data is not
verified travel information. Lint remains unconfigured; native layout, keyboard,
and accessibility still require device testing. The verification server was
stopped after checks. No dependencies or dataset records changed. Brick 10
acceptance criteria passed; Brick 11 remains pending explicit approval.

## Brick 11 Verification

Home finds directed journeys with up to three segments by default. Try From
`Sample Plaza Jeepney Stop` to To `Sample Palengke Bus Stop`: the existing sample
jeepney/bus journey transfers at `Sample Bayan Terminal`. The records remain
fictional. No fare rules are configured in application data, so totals are unknown.

Callers can supply a `maxSegments` of 1 through 6 and explicit fare bindings to
exact route/boarding/alighting IDs. Each segment uses the existing calculator.
Only fully calculated, safe totals contain a monetary value; missing, ambiguous,
unconfigured, invalid, or uncalculable segment fares prevent a complete total.
No partial sum is presented as the journey cost. Fewer transfers sort first;
there is no fastest/cheapest guarantee or inferred walking interchange.

| Command or check | Actual result |
| --- | --- |
| `npm run check:journeys` | Initial 18 planner tests passed; two further edge-case tests were added |
| Full Node test run over journeys, direct routes, fare calculation, stop search, navigation, form, and dataset suites | All 92 tests passed: 20 planner, 14 direct/resolution, 21 fare, 9 search, 10 navigation/UI, 12 form, 6 dataset |
| `npx --no-install tsc --noEmit` | Passed |
| Isolated strict ES2020 compilation of `findJourneys.ts` with `types: []` | Passed without UI/framework ambient types |
| `npx --no-install expo install --check` | Dependencies up to date |
| `npx --yes expo-doctor` | All 21 checks passed |
| `npm start -- --localhost --port 8084` | Metro started in CI mode with temporary Expo settings and process-local Expo token removed |
| Android/iOS bundle requests | Both HTTP 200; Android includes planner, sample warning, and incomplete-total label |

No dependencies, transport records, or official fare data were added. Runtime
fare math uses integer centavos/BigInt; UI monetary display also avoids floating
division. Exact rule assignments, distances, dates, verified source authenticity,
and passenger eligibility are caller responsibilities. The planner is intended
for small datasets, not large production graph optimization. UI tests stub native
hosts/hooks; device layout, keyboard behavior, and accessibility remain unverified.
Lint is unconfigured. The verification server was stopped after checks. Brick 11
acceptance criteria passed. Brick 12's subsequent verification is recorded above.

## Brick 13 Verification

The Laravel API foundation is in `apps/api/`. It serves only `GET /api/health`
(standard HEAD also supported), returning HTTP 200 with
`{"service":"komyut-api","status":"ok"}`. This is database-independent liveness,
not transport/database readiness. Windows setup and check commands are documented
in [the API README](apps/api/README.md).

PHP 8.2.12 and Composer 2.8.11 were available. Laravel 12.69.3 was selected for
PHP 8.2 compatibility; Laravel 13 requires PHP 8.3+. Laravel 12's bug-fix window
has ended, but security fixes continue until February 24, 2027. Use a patched PHP
release and plan an authorized upgrade before then. The installed PHP patch is
old; global workstation tooling was not changed. See the
[Laravel support policy](https://laravel.com/docs/13.x/releases).

| Command or check | Actual result |
| --- | --- |
| `composer create-project laravel/laravel apps/api '^12.0' --prefer-dist --no-interaction --no-scripts` | Succeeded with temporary Composer cache; stock database creation/migration scripts were skipped |
| Composer lock update and `composer install --no-interaction --prefer-dist` | Passed; removed unused generated Sail/Pail/Faker dependencies; normal package discovery succeeds |
| `php artisan key:generate --no-interaction` | Generated a private local key; `.env` is ignored |
| `php artisan test` | All 4 feature tests passed, 19 assertions |
| `php vendor/laravel/pint/builds/pint --test` | Passed after formatting two generated scaffold files flagged by the initial check |
| `php -l` over application/bootstrap/config/routes/tests/public PHP files | All 21 checked files passed, including two generated ignored bootstrap cache files |
| `composer validate --strict` | Passed |
| `composer check-platform-reqs` | All installed platform requirements passed |
| `composer audit --no-interaction` | No security vulnerability advisories reported |
| `php artisan route:list -v` | Exactly one HTTP route: `GET\|HEAD api/health`, standard `api` middleware |
| `php artisan serve --host=127.0.0.1 --port=8000 --no-reload` | Started successfully; actual HTTP health request returned 200, application/json, and exact contract |
| `npx --no-install tsc --noEmit` in mobile | Passed |
| `node --test --test-reporter=spec scripts/*.test.cjs` in mobile | All 104 tests passed |
| Mobile SHA-256 before/after comparison | All 51 source/config files unchanged; no files added |
| Git ignore and scope checks | Private environment files, vendor, and logs ignored; safe template visible; no SQLite file or Next.js app |

An initial backend-check invocation used the repository root instead of
`apps/api/`; those commands could not find Composer/artisan files. They were
rerun from the correct directory and passed. No application defect remained.
The default storage download/upload routes were disabled because they are not
part of this API foundation. No existing mobile files were modified. No database
migrations, authentication, transport endpoints, or mobile API integration were
implemented. Mobile lint remains unconfigured; PHP style checking is available
and passed. The verification server was stopped after checks. Brick 13 acceptance
criteria passed. Brick 14's subsequent definition-only verification follows.

## Brick 14 Verification

One PostgreSQL-only migration defines seven tables: transport stops, operators,
operator vehicle types, routes, ordered route stops, fare rules, and directed
station-pair fares. Seven small Eloquent models expose the corresponding
relationships. String domain IDs, restrictive foreign keys, ordering/membership
uniqueness, optional bounded coordinates, closed types, exact integer-centavo
money, variant configuration, and source/verification metadata are defined.
Unknown fares contain no pricing amount; no records or fares are seeded.

PostgreSQL settings now have safe placeholders in `.env.example`; private `.env`
and all 51 mobile source/config file hashes are unchanged. Local setup, explicitly
scoped migration commands, and opt-in transactional test instructions are in
[the API README](apps/api/README.md). Detailed schema and application-boundary
limitations are in [the architecture document](docs/architecture.md).

| Command or check | Actual result |
| --- | --- |
| `php --version`, `php artisan --version` | PHP 8.2.12, Laravel 12.69.3; 64-bit PHP confirmed |
| `PDO::getAvailableDrivers()` and PostgreSQL tool/service discovery | No `pgsql` PDO driver; no PostgreSQL client/service discovered |
| `php artisan test` | 13 database-independent tests passed, 94 assertions; 22 live PostgreSQL tests explicitly skipped |
| PostgreSQL grammar up/down compilation in pretend mode | Passed without making a PDO connection; this is not native SQL execution |
| `php -l` across application/bootstrap/config/routes/tests/public/migrations PHP files | All 29 checked source files passed |
| `php vendor/laravel/pint/builds/pint --test` | Passed |
| `composer validate --strict` | Passed |
| `php artisan route:list -v` | Only existing GET/HEAD `/api/health`; no transport endpoint added |
| `npx --no-install tsc --noEmit` in mobile | Passed |
| `node --test --test-reporter=spec scripts/*.test.cjs` in mobile | All 104 tests passed |
| SHA-256 comparison and scope/ignore checks | Mobile and private environment unchanged; secrets ignored; no SQLite or web app created |

No real PostgreSQL instance was used or contacted, no migration was applied or
rolled back, and no existing database was changed. Native constraint enforcement,
index creation, persistence, and migration reversal remain unverified. No SQLite
or MySQL substitution occurred. No extension, dependency, API controller, fare
calculator, or mobile integration was added. The applicable definition-only
Brick 14 criteria passed; live PostgreSQL verification is still required before
using the schema. Brick 15's subsequent verification is below.

## Mobile API Setup (Brick 15)

No dependency or native build configuration was added. Set up Laravel and the
local PostgreSQL database using [the API README](apps/api/README.md). Health alone
does not prove the transport tables/connection work; absent database setup, the
transport endpoints return 503 and the app retains labeled fictional samples.

From `apps/mobile/`, create `.env.local` only if it does not already exist:

```powershell
if (-not (Test-Path -LiteralPath .env.local)) { Copy-Item -LiteralPath .env.example -Destination .env.local }
```

Set its public base URL, including `/api`. This is an example address, not an
address detected or configured on your computer:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000/api
```

Replace it with your computer's reachable LAN IP and the API's actual port. For
phone access, run Laravel with a reachable bind address on a trusted private
network, e.g. `php artisan serve --host=0.0.0.0 --port=8000`. Restrict firewall
access to that private network. An iPhone/physical device cannot normally reach
the Windows computer via localhost/127.0.0.1: those refer to the device itself.
Android Studio's standard emulator may use `10.0.2.2`; physical devices need a
reachable LAN/development URL. Use HTTPS when device security requires it; no
security override or CORS relaxation is added.

Restart Expo after changing configuration and fully reload the app:

```powershell
npm start
```

Search starts in sample mode with no requests. Select Load API stops to opt in.
Name/address queries and the terminal filter use the API with a 300 ms debounce.
API empty lists remain empty; errors/loading display explicit sample fallback.
Retry API stops repeats the request; Use sample stops cancels it and restores
local search. Responses are capped at 100; narrow the query when more matches
exist. Home still plans fictional samples only, not remote API routes.
Never put secrets in EXPO_PUBLIC settings: they are included in the mobile bundle.

## Brick 15 Verification

Read-only GET/HEAD health, stops and routes are registered. Health returns the
existing service/status object. Stops/routes use `data` plus `meta.limit` and
`meta.hasMore`, reusing mobile transport fields. Routes include ordered stop IDs.
No write endpoints, auth, new fare/planning logic, dataset records, database
migrations, website, or dependencies were introduced.

| Command or check | Actual result |
| --- | --- |
| `node --test --test-reporter=spec scripts/*.test.cjs` | All 121 mobile tests passed |
| `npx --no-install tsc --noEmit` | Passed |
| `php artisan test` | 21 tests passed, 135 assertions; 25 native PostgreSQL tests skipped because pdo_pgsql is unavailable |
| `php -l` over application/bootstrap/config/routes/tests/public/migrations PHP files | All 31 checked files passed |
| `php vendor/laravel/pint/builds/pint --test` | Passed after correcting new route import ordering |
| `composer validate --strict` | Passed |
| `php artisan route:list -v` | Exactly three read-only endpoints: health, stops, routes |
| `php artisan serve --host=127.0.0.1 --port=8001 --no-reload` and real HTTP checks | Health 200; transport 503 with sanitized JSON; invalid limit 422 |
| Actual typed client call from Node to that Laravel server | Correctly reported typed HTTP error with status 503 |
| `npm start -- --localhost --port 8086` with isolated CI settings | Metro started; Android/iOS bundles returned 200 with API/fallback code |
| `npx --no-install expo install --check` | Exit 1: recommends Expo 57.0.28 over installed 57.0.27; no unrelated dependency update performed |
| Ignore checks | Local environment files ignored; safe templates remain visible |

An endpoint contract test initially failed because its mock was installed after
the first request had cached a controller instance. Fixture ordering was fixed;
the full rerun passed. Successful list responses are tested with synthetic
in-memory records, not an actual PostgreSQL connection. No SQLite/MySQL fallback
was used. Database-backed successful fetching, actual phone networking and native
layout remain unverified. Hook/UI tests use controlled effects and host stubs.
Mobile lint remains unavailable. Verification servers were stopped; existing
private environment values were not edited. Brick 15 implementation is complete
with these explicit verification limits; Brick 16 awaits approval.
