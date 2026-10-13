# TrainsPh Rail Snapshots

This directory is owned by the phase-one TrainsPh importer. `2026-10-07/`
contains the original UTF-8 bytes downloaded separately from:

- https://trainsph-data.web.app/manifest.json
- https://trainsph-data.web.app/lrt1.json
- https://trainsph-data.web.app/lrt2.json
- https://trainsph-data.web.app/mrt3.json

Do not reformat these JSON files. Their byte lengths and SHA-256 hashes must
match the manifest. The parser additionally pins the manifest itself to
`87528f9a13b9419e6004bf44f22f98a779152512f9bdd11a2148f99e1eed37a3`.
No network request occurs during preview or apply. Replacing the snapshot or
accepting a new schema/version requires a separately reviewed code/data change.

## License and Attribution

The manifest and https://trains.ph/data/ publish these three fare/station
datasets under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/.

Fare and station data: TrainsPh (https://trains.ph), CC BY 4.0

Retain this credit, source links, license link, provenance dates, and the fact
that Komyut transforms the data into station/operator/canonical-route records.
No endorsement by TrainsPh or the transport operators is implied.

Source generation: 2026-10-07. Source fare verification claim: 2026-09-18.
Source coordinate verification claims: 2026-09-20. These are TrainsPh claims,
not independent Komyut verification. Imported `verified_on` stays null; claims,
hashes, attribution and underlying fare-source links are recorded in notes.
The unchanged snapshots preserve full upstream provenance and ignored fields.

This license does not cover every manifest entry uniformly: landmarks are
listed as CC BY-SA 4.0 and geography as ODbL-1.0. Neither is downloaded/imported.

## Explicit Mapping

| Source line | Operator ID | Route ID |
| --- | --- | --- |
| lrt1 / LRMC | trainsph-lrmc | trainsph-lrt1-canonical |
| lrt2 / LRTA | trainsph-lrta | trainsph-lrt2-canonical |
| mrt3 / DOTr-MRT3 | trainsph-dotr-mrt3 | trainsph-mrt3-canonical |

Station IDs are unchanged. All stops use `train_station`; each operator has a
`train` association. Route names explicitly say "canonical order". Position is
ascending source ordinal minus one. No reverse route, transfer, interchange,
payable fare, ticket product, or discount is inferred/imported. Existing Home
planning remains fictional and unchanged.

## Preview and Apply

From `apps/api/`, after reviewing the existing local connection:

```powershell
php artisan transport:import-trainsph
```

This is the default dry-run: it validates all pinned files and compares database
records without inserting/updating/deleting anything. Standalone previews use
a PostgreSQL read-only, repeatable-read transaction. It requires a working
approved local PostgreSQL target; it does not fabricate a database-free preview.

Only these explicitly reviewed development targets are allowed, in `APP_ENV=local`:
loopback host with `komyut:5433/public` (the existing Docker setup), or
`komyut_local:5432/public` (the documented native setup). URL overrides,
read/write split targets, other schemas/ports/databases, and production/staging
environments are refused. The connected database/schema are checked too.
Loopback is not proof against a manually configured remote tunnel: the user must
confirm this is their local development database, never production.

Only after preview and approval, for the existing Docker target:

```powershell
php artisan transport:import-trainsph --apply --confirm-local=komyut
```

For the native target the exact confirmation is `--confirm-local=komyut_local`.
This documentation does not authorize or execute apply, migrations, or seeding.

Parents are owned only when both `source_name=TrainsPh` and notes begin with
`Komyut importer: trainsph-rail-v1` followed by a newline. Existing colliding IDs
without that marker are conflicts, never adopted. Child ownership follows the
owned operator/route; do not manually manage children of importer-owned parents.
Existing other vehicle types are preserved. Stops missing from a future input
are not deleted. Unknown/unrelated parents and fares are never written.

An advisory transaction lock refuses concurrent imports. Apply also locks the
five affected tables against concurrent writers while comparing/writing. All
changes share one transaction. Changed owned route sequences are replaced only
within their route, avoiding temporary unique-position conflicts. Identical
records/sequences are not rewritten, including timestamps and child IDs.
Summary counts are proposed changes on preview/conflict and committed changes
only after a successful apply. Route-stop updates count desired child rows in
each replaced sequence, not deleted rows. Any conflict refuses the entire apply.

## Tests and Verification Limits

```powershell
php artisan test --filter='TrainSnapshotParserTest|TrainImportCommandTest|TrainImporterPostgresTest'
php artisan test
php vendor/laravel/pint/builds/pint --test
composer validate --strict
```

Parser and command tests are database-independent. Transaction tests need the
existing isolated PostgreSQL pattern: a separate database named exactly
`komyut_brick14_test`, a dedicated test role, and explicit opt-in. Never target
the development database or production for these tests. Prepare this separately
with approval; no command here creates a database or role.

Set `KOMYUT_TEST_DB_USERNAME` and `KOMYUT_TEST_DB_PASSWORD` privately, then:

```powershell
$env:KOMYUT_TEST_DB_PORT='5433' # Existing Docker port; defaults to 5432 otherwise.
$env:KOMYUT_PG_TESTS='1'
php artisan test --filter=TrainImporterPostgresTest
Remove-Item Env:KOMYUT_PG_TESTS
```

The integration suite creates a unique transactional schema and rolls back its
own objects/fixtures; it never resets public tables. Existing Brick 14 native
tests retain their original fixed port 5432 contract. Do not assume this optional
importer-specific port setting changes those older tests.

Current real preview succeeds with proposed counts 51 stops, 3 operators, 3
train associations, 3 routes and 51 route stops, all conflicts zero. No apply
has committed. The separate test database/role are not confirmed and test
credentials/opt-in are absent: transactional apply, rollback, idempotency and
concurrency verification remain blocked, not proven by mock/unit tests.

Implementation checks: 10 focused parser/command tests passed (227 assertions),
10 importer integration tests skipped with explicit blocker messages. The full
Laravel suite passed 32 tests (370 assertions), with 35 native PostgreSQL tests
skipped in total. Pint, PHP syntax across 39 files and Composer validation passed.
All 121 existing mobile tests and TypeScript passed without mobile changes.
All seven database table contents were compared before/after a real preview and
were unchanged. These results do not establish successful transactional apply.
An actual command with `--apply` but no confirmation was also refused before
connecting/writing; it exited 1 with the required exact confirmation message.
