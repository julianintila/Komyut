# Komyut API

Bricks 13 through 15 establish the Laravel API, PostgreSQL schema definitions,
and read-only stop/route endpoints used by the mobile API client. There is no
authentication, write API, or frontend build. Subsequent local setup now provides
pdo_pgsql and the applied schema: health and empty stop/route requests return 200.
The historical verification results below describe their respective earlier tasks.

The supplemental phase-one TrainsPh importer adds only stations, operators and
canonical-order routes from pinned, attributed snapshots. See
[mapping, safety controls, commands and verification limits](database/data/trainsph/README.md).
Preview is the default; no apply was executed during implementation. Dedicated
PostgreSQL importer transaction tests remain blocked by unconfirmed test setup.

## Requirements

- PHP 8.2 or newer within Laravel 12's supported PHP range (8.2 through 8.5).
  Use a currently patched PHP release. This workstation was tested with PHP 8.2.12.
- Composer 2.2+; tested with Composer 2.8.11.
- Required PHP extensions can be checked with `php -m` and
  `composer check-platform-reqs`. No PostgreSQL driver is needed for health.
- PostgreSQL operations require `pdo_pgsql` and a supported local PostgreSQL
  installation. Use 64-bit PHP for the models' integer-centavo casts.
- PHP and Composer must be on PATH in the current PowerShell terminal. Their
  installation locations are not prescribed by this repository.

Laravel 12.69.3 is locked in `composer.lock`. Laravel 12 supports PHP 8.2 and
receives security fixes until February 24, 2027; its bug-fix window ended August
13, 2026. Laravel 13 requires PHP 8.3+. Plan a runtime/framework upgrade before
Laravel 12's security support ends; do not silently upgrade during another brick.
See the [official support policy](https://laravel.com/docs/13.x/releases).

## Windows Setup

From the repository root:

```powershell
php --version
composer --version
cd apps/api
composer install
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
php artisan key:generate
php artisan serve --host=127.0.0.1 --port=8000
```

Keep an existing `.env` and application key. Generate a key only for a new local
installation; do not regenerate keys on each startup. The setup above contains
no migration command. Node.js, npm, Docker, Sail, and Sanctum are not required.
Use an unused port if 8000 is occupied and set `APP_URL` in your local `.env`
to match. Stop the local server with Ctrl+C.

In a second PowerShell terminal:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/health
```

The endpoint returns HTTP 200, `Content-Type: application/json`, and:

```json
{"service":"komyut-api","status":"ok"}
```

This is process/application liveness, not database readiness or proof that
transport data is available. Transport endpoints currently return sanitized 503
errors here; successful database-backed fetching remains unverified. No fares
are served or records seeded.

## Environment and Security

`.env.example` has no secrets: `APP_KEY` and credential fields are empty.
The real `.env`, other local environment variants, vendor files, and runtime
logs/caches are ignored. Keep `.env.example` safe to share.

Local defaults are `APP_ENV=local`, `APP_DEBUG=false`, a loopback `APP_URL`,
file cache/session storage, and a synchronous queue. The safe template now uses
`DB_CONNECTION=pgsql`, loopback PostgreSQL settings, and empty credentials.
Your existing `.env` is not changed; older installations may still explicitly use
`DB_CONNECTION=unconfigured`. Health works without database access either way.
API middleware is
stateless and health uses no session or database. Unused local-file download and
upload routes are disabled. Standard framework driver and
authentication configuration remains dormant: there is no user model, user
migration, auth route, or auth package. Seven transport/fare tables are defined by
the Brick 14 migration. No data is seeded; read endpoints require a configured database.

For a future production environment, independently supply `APP_ENV=production`,
`APP_DEBUG=false`, its HTTPS `APP_URL`, a private application key, and an
appropriate log level. Never ship local `.env` values or enable debug output on
shared/public servers. Deployment/server configuration is deferred to Brick 18.
Unknown API routes and errors use Laravel JSON responses even without an Accept
header. With debug off, internal exceptions are not exposed in responses.

## Checks

Run from `apps/api/`:

```powershell
composer validate --strict
composer check-platform-reqs
php artisan route:list --path=api -v
php artisan test --filter=HealthTest
php artisan test
php vendor/laravel/pint/builds/pint --test
```

PHPUnit checks exact health JSON without a database connection, unsupported HTTP
methods, missing routes, and sanitized production-mode exceptions. Pint is the
standard Laravel formatter; the PHP entry works on Windows. `composer test` and
`composer dev` are optional shortcuts for tests and the local API server.

API routing is registered through the supported `withRouting(api: ...)` option
in `bootstrap/app.php`, rather than `install:api`, which would install Sanctum.
See [Laravel routing](https://laravel.com/docs/12.x/routing).
Generated frontend assets, Docker tooling, user scaffolding, and default database
migrations were removed in Brick 13. The Brick 14 migration defines only transport
and fare persistence. No migrations were executed here and no SQLite substitute
was used. Search's optional API source is added in Brick 15; Next.js awaits Brick 16.

## Transport 503 Diagnosis (Brick 15A)

The local reproduction on October 13, 2026 confirmed health HTTP 200, both
transport endpoints HTTP 503 with the documented generic error, and an invalid
stop limit HTTP 422. The corresponding private Laravel log entries identified
`InvalidArgumentException: Database connection [unconfigured] not configured.`
The effective default connection is `unconfigured`, with no matching connection
definition; configuration is not cached. Laravel fails while resolving the
connection, before connecting or issuing SQL. This is the immediate cause, not
an observed service, authentication, or schema failure.

There are additional setup blockers: the active PHP CLI is
`C:\xampp\php\php.exe`, using `C:\xampp\php\php.ini`; `pdo_pgsql` is not loaded
and available PDO drivers are sqlsrv, mysql, and sqlite. Effective PostgreSQL
username/password settings are empty and no PostgreSQL URL override is present.
Changing only the connection name would not establish a working PostgreSQL API.
Database service availability, authentication, and schema compatibility remain
unverified; no PostgreSQL connection or migration was attempted.

Resolution requires separately authorized local machine/database setup: enable
the matching PHP PostgreSQL PDO driver, establish a local PostgreSQL service and
database/role, and privately configure `DB_CONNECTION=pgsql` with the correct
local settings. Applying the reviewed schema also requires explicit approval.
See the setup instructions below; these are requirements, not completed actions.
Do not change the application key, use a substitute database, or treat health
HTTP 200 as database readiness.

The existing sanitized 503 handling is retained. A database-independent regression
test now exercises the real Eloquent connection-resolution failure without
mocking model retrieval, including debug-enabled response safety, unchanged
health, and parameter validation. Graceful error handling is not successful
PostgreSQL-backed fetching.

## Local PostgreSQL Setup (Brick 14)

Check the PHP CLI that Composer/Artisan actually uses:

```powershell
php --ini
php -r 'echo implode(", ", PDO::getAvailableDrivers()), PHP_EOL;'
```

If `pgsql` is absent, stop before attempting database operations. Enable the
matching `pdo_pgsql` extension in that PHP installation's active configuration
and verify again in a new terminal. On Windows, the DLL must match the PHP build
and have its required PostgreSQL client libraries available. This task does not
change global PHP configuration or assume a particular PHP installation path.

Install a supported PostgreSQL release separately. Create a **new, empty local
development database** named `komyut_local` and a dedicated role through your
database administration tool. Do not reuse a production or existing-data database.
Privately update only the relevant entries in your existing `.env`:

- `DB_CONNECTION=pgsql`, `DB_HOST=127.0.0.1`, `DB_PORT=5432`.
- `DB_DATABASE=komyut_local`; set `DB_USERNAME` and `DB_PASSWORD` to your local role.
- `DB_SCHEMA=public`, `DB_SSLMODE=prefer` for local development.
- Keep `APP_ENV=local` and `APP_DEBUG=false`; do not replace your application key.

Review the private connection settings, including any `DB_URL` override. Confirm
the target database/user in your database tool before running, from `apps/api/`:

```powershell
php artisan config:clear
php artisan migrate --database=pgsql
php artisan migrate:status --database=pgsql
```

These commands are instructions, **not checks executed in this task**. Do not run
them against production or an existing dataset. Do not use reset/fresh commands.
Migrations are PostgreSQL-only and reverse in dependency order, but live execution
and reversal remain unverified. No PostgreSQL extension (including PostGIS) is
required; this schema has no geographic routing or proximity functions.

## Schema Checks

`php artisan test` runs the existing health checks and database-free PostgreSQL
grammar/model tests. They use pretend mode with a PDO callback that throws if
anything attempts a connection. This verifies definitions, not native SQL
execution or constraint enforcement. Ordinary syntax/Pint checks need no database.

Live integration tests are explicitly opt-in. Prepare a **separate empty local
test database** named exactly `komyut_brick14_test`, on `127.0.0.1:5432`, and a
dedicated test role with CONNECT and CREATE privileges on that database. Set
`KOMYUT_TEST_DB_PASSWORD` privately in the terminal if password authentication is
required; never add credentials to source files. Then:

```powershell
$env:KOMYUT_TEST_DB_USERNAME='your_local_test_role'
$env:KOMYUT_PG_TESTS='1'
php artisan test --filter=PostgresTransportSchemaTest
Remove-Item Env:KOMYUT_PG_TESTS
```

The test connection never inherits the app's DB URL/host/name/credentials. It
requires the testing environment and exact local test target. Each test creates
a unique schema inside its own transaction, sets a schema-only local search path,
and rolls back its own objects/fixtures. Existing schemas/data are not reset.
No migration rollback/drop/reset command is used by the live test runner. Missing
drivers or absent opt-in produce explicit skips, not fake PostgreSQL passes.

Current results: 21 database-independent tests passed (135 assertions), while all
25 live PostgreSQL tests were skipped because `pdo_pgsql` is unavailable. Migration
execution, native foreign keys/checks/indexes, and real persistence remain
unverified. See [schema and storage limitations](../../docs/architecture.md).

## Read-Only API (Brick 15)

- `GET /api/health`: unchanged `{"service":"komyut-api","status":"ok"}`.
- `GET /api/stops`: optional trimmed `q` (maximum 120 characters), `type` (the
  existing stop-type union), and integer `limit` (1 through 100, default 50).
  PostgreSQL ILIKE matches partial names/addresses without case sensitivity.
  Values are bound; %, underscore and backslash are escaped as literal characters.
- `GET /api/routes`: optional limit with the same bounds/default. Routes eagerly
  load ordered route-stop rows; there is no per-route query.

Both lists order by stable ID and use this success contract (empty example,
not an observed successful database response here):

```json
{"data":[],"meta":{"limit":50,"hasMore":false}}
```

Stops return id/name/type, optional numeric location, address and source. Routes
return id/name/operatorId/vehicleType, ordered stopIds and optional source. Source
uses sourceName, optional sourceUrl, ISO YYYY-MM-DD verifiedOn, and notes. No private
model/configuration attributes or timestamps are serialized; no verification is
implied. No sample data is injected into these endpoints.

An extra parent row determines hasMore, then is omitted. There is no cursor yet;
Search can narrow its query. Child sequences are complete, not truncated to fit
the parent limit. Route fetching is not connected to Home's fictional planner.
Invalid parameters use standard Laravel HTTP 422 JSON message/errors. Unavailable
database settings, drivers, tables or connections return HTTP 503:

```json
{"error":{"code":"transport_unavailable","message":"Transport data is currently unavailable."}}
```

Exceptions are logged privately, never included in that response. Only GET/HEAD
are registered; writes receive 405. Contract tests mock result retrieval while
checking serialization, validation, limits, PostgreSQL query bindings and eager
loading. Three added native endpoint tests are opt-in and skipped here.

For phone testing on a trusted private LAN, run the API with a reachable bind
address, for example `php artisan serve --host=0.0.0.0 --port=8000`. Allow its port
only on the trusted private network. Set the mobile public URL to the computer's
reachable LAN address including /api. On an iPhone, localhost/127.0.0.1 refers to
the phone, not the Windows computer. Use reachable HTTPS if device transport
security rejects HTTP; do not disable TLS or native protections. No CORS/security
relaxation, public deployment, or database migration is added in this brick.
