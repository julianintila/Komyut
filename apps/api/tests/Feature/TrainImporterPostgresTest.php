<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\TrainsPh\ImportSafetyException;
use App\Services\TrainsPh\TrainImporter;
use App\Services\TrainsPh\TrainSnapshotParser;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PDO;
use Tests\TestCase;

class TrainImporterPostgresTest extends TestCase
{
    private ?Connection $database = null;

    private array $records;

    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('BLOCKED: importer transactions require pdo_pgsql; not verified.');
        }
        if (getenv('KOMYUT_PG_TESTS') !== '1' || ! getenv('KOMYUT_TEST_DB_USERNAME')) {
            $this->markTestSkipped('BLOCKED: prepare komyut_brick14_test and private test credentials, then explicitly opt in. Import transactions are not verified.');
        }
        $this->assertSame('testing', app()->environment());
        $port = getenv('KOMYUT_TEST_DB_PORT') ?: '5432';
        $this->assertContains($port, ['5432', '5433']);
        $schema = 'komyut_test_'.bin2hex(random_bytes(8));
        config(['database.default' => 'import_test', 'database.connections.import_test' => [
            'driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => $port,
            'database' => 'komyut_brick14_test', 'username' => getenv('KOMYUT_TEST_DB_USERNAME'),
            'password' => getenv('KOMYUT_TEST_DB_PASSWORD') ?: '', 'prefix' => '',
            'sslmode' => 'prefer', 'search_path' => $schema,
        ]]);
        $this->database = DB::connection();
        $this->assertSame('komyut_brick14_test', $this->database->scalar('SELECT current_database()'));
        $this->database->beginTransaction();
        $this->database->statement('CREATE SCHEMA "'.$schema.'"');
        $this->database->statement('SET LOCAL search_path TO "'.$schema.'"');
        $migration = require database_path('migrations/2026_10_12_000000_create_transport_schema.php');
        $migration->up();
        $this->records = (new TrainSnapshotParser)->load();
    }

    protected function tearDown(): void
    {
        try {
            if ($this->database !== null && $this->database->transactionLevel() > 0) {
                $this->database->rollBack();
            }
        } finally {
            parent::tearDown();
        }
    }

    private function state(): array
    {
        $state = [];
        foreach (['transport_operators', 'operator_vehicle_types', 'transport_stops', 'transport_routes', 'route_stops', 'fare_rules', 'fare_station_pairs'] as $table) {
            $state[$table] = $this->database->table($table)->orderBy('id')->get()->toJson();
        }

        return $state;
    }

    private function apply(?array $records = null): array
    {
        return (new TrainImporter)->run($this->database, $records ?? $this->records, true, 'komyut_brick14_test');
    }

    public function test_dry_run_does_not_change_any_table(): void
    {
        $before = $this->state();
        $summary = (new TrainImporter)->run($this->database, $this->records);
        $this->assertSame(51, $summary['counts']['transport_stops']['created']);
        $this->assertSame($before, $this->state());
    }

    public function test_first_import_creates_only_phase_one_records_in_canonical_order(): void
    {
        $summary = $this->apply();
        $this->assertSame([], $summary['conflicts']);
        foreach (['transport_stops' => 51, 'transport_operators' => 3, 'operator_vehicle_types' => 3, 'transport_routes' => 3, 'route_stops' => 51] as $table => $count) {
            $this->assertSame($count, $this->database->table($table)->count());
        }
        $this->assertSame(0, $this->database->table('fare_rules')->count());
        $this->assertSame(0, $this->database->table('fare_station_pairs')->count());
        $this->assertSame(0, $this->database->table('transport_stops')->whereNotNull('verified_on')->count());
        $this->assertSame('lrt1_fernando_poe_jr', $this->database->table('route_stops')->where('route_id', 'trainsph-lrt1-canonical')->orderBy('position')->value('stop_id'));
        $this->assertSame(range(0, 24), $this->database->table('route_stops')->where('route_id', 'trainsph-lrt1-canonical')->orderBy('position')->pluck('position')->all());
    }

    public function test_identical_reimport_changes_no_values_timestamps_or_child_ids(): void
    {
        $this->apply();
        $before = $this->state();
        $summary = $this->apply();
        foreach ($summary['counts'] as $counts) {
            $this->assertSame(0, $counts['created']);
            $this->assertSame(0, $counts['updated']);
            $this->assertSame(0, $counts['conflicting']);
        }
        $this->assertSame($before, $this->state());
    }

    public function test_database_failure_rolls_back_all_parent_and_child_changes(): void
    {
        $before = $this->state();
        $invalid = $this->records;
        $invalid['transport_routes'][2]['name'] = '';
        try {
            $this->apply($invalid);
            $this->fail('Expected database constraint failure');
        } catch (QueryException) {
            $this->assertSame($before, $this->state());
        }
        $this->apply();
        $this->assertSame(51, $this->database->table('transport_stops')->count());
    }

    public function test_unrelated_records_and_existing_fares_are_preserved(): void
    {
        $this->database->table('transport_stops')->insert(['id' => 'unrelated-stop', 'name' => 'Synthetic unrelated stop', 'type' => 'bus_stop']);
        $this->database->table('transport_operators')->insert(['id' => 'unrelated-operator', 'name' => 'Synthetic unrelated operator']);
        $this->database->table('operator_vehicle_types')->insert(['operator_id' => 'unrelated-operator', 'vehicle_type' => 'bus']);
        $this->database->table('transport_routes')->insert(['id' => 'unrelated-route', 'name' => 'Synthetic unrelated route', 'operator_id' => 'unrelated-operator', 'vehicle_type' => 'bus']);
        $this->database->table('route_stops')->insert(['route_id' => 'unrelated-route', 'stop_id' => 'unrelated-stop', 'position' => 0]);
        $this->database->table('fare_rules')->insert(['id' => 'unrelated-fare', 'name' => 'Synthetic fixture only', 'vehicle_type' => 'bus', 'currency' => 'PHP', 'structure_type' => 'station_pair', 'reliability' => 'unverified']);
        $this->database->table('fare_station_pairs')->insert(['fare_rule_id' => 'unrelated-fare', 'origin_stop_id' => 'unrelated-stop', 'destination_stop_id' => 'unrelated-stop', 'amount_centavos' => 0]);
        $before = $this->state();
        $this->apply();
        $after = $this->state();
        foreach (['fare_rules', 'fare_station_pairs'] as $table) {
            $this->assertSame($before[$table], $after[$table]);
        }
        foreach (['transport_stops', 'transport_operators', 'transport_routes'] as $table) {
            $this->assertEquals(json_decode($before[$table])[0], $this->database->table($table)->where('id', json_decode($before[$table])[0]->id)->first());
        }
        $this->assertSame('unrelated-stop', $this->database->table('route_stops')->where('route_id', 'unrelated-route')->value('stop_id'));
        $this->assertSame('bus', $this->database->table('operator_vehicle_types')->where('operator_id', 'unrelated-operator')->value('vehicle_type'));
    }

    public function test_ownership_conflict_refuses_the_entire_import(): void
    {
        $this->database->table('transport_stops')->insert(['id' => 'lrt1_fernando_poe_jr', 'name' => 'Synthetic manually managed stop', 'type' => 'train_station']);
        $before = $this->state();
        $summary = $this->apply();
        $this->assertCount(1, $summary['conflicts']);
        $this->assertSame(1, $summary['counts']['transport_stops']['conflicting']);
        $this->assertSame($before, $this->state());
    }

    public function test_reordering_owned_route_stops_does_not_violate_unique_constraints(): void
    {
        $this->apply();
        $changed = $this->records;
        foreach ($changed['route_stops'] as &$row) {
            if ($row['route_id'] === 'trainsph-lrt1-canonical' && $row['position'] < 2) {
                $row['position'] = 1 - $row['position'];
            }
        }
        unset($row);
        usort($changed['route_stops'], fn (array $a, array $b): int => [$a['route_id'], $a['position']] <=> [$b['route_id'], $b['position']]);
        $summary = $this->apply($changed);
        $this->assertSame(25, $summary['counts']['route_stops']['updated']);
        $this->assertSame(['lrt1_balintawak', 'lrt1_fernando_poe_jr'], $this->database->table('route_stops')->where('route_id', 'trainsph-lrt1-canonical')->orderBy('position')->limit(2)->pluck('stop_id')->all());
        $this->assertSame(0, $this->apply($changed)['counts']['route_stops']['updated']);
    }

    public function test_updates_only_changed_importer_owned_records(): void
    {
        $this->apply();
        $changed = $this->records;
        $changed['transport_stops'][0]['name'] = 'Synthetic updated fixture';
        $summary = $this->apply($changed);
        $this->assertSame(1, $summary['counts']['transport_stops']['updated']);
        $this->assertSame(50, $summary['counts']['transport_stops']['unchanged']);
        $this->assertSame(51, $summary['counts']['route_stops']['unchanged']);
    }

    public function test_wrong_confirmation_prevents_all_writes(): void
    {
        $before = $this->state();
        try {
            (new TrainImporter)->run($this->database, $this->records, true, 'komyut');
            $this->fail('Accepted incorrect confirmation');
        } catch (ImportSafetyException) {
            $this->assertSame($before, $this->state());
        }
    }

    public function test_concurrent_import_lock_refuses_writes(): void
    {
        config(['database.connections.import_lock_test' => config('database.connections.import_test')]);
        $other = DB::connection('import_lock_test');
        try {
            $other->beginTransaction();
            $other->selectOne('SELECT pg_advisory_xact_lock(1263490393, 1)');
            $before = $this->state();
            try {
                $this->apply();
                $this->fail('Concurrent importer bypassed advisory lock');
            } catch (ImportSafetyException $exception) {
                $this->assertStringContainsString('Another TrainsPh import', $exception->getMessage());
                $this->assertSame($before, $this->state());
            }
        } finally {
            if ($other->transactionLevel() > 0) {
                $other->rollBack();
            }
            DB::purge('import_lock_test');
        }
    }
}
