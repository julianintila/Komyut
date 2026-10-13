<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\FareRule;
use App\Models\TransportOperator;
use App\Models\TransportRoute;
use App\Models\TransportStop;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PDO;
use Tests\TestCase;

class PostgresTransportSchemaTest extends TestCase
{
    private ?Connection $database = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (! in_array('pgsql', PDO::getAvailableDrivers(), true)) {
            $this->markTestSkipped('pdo_pgsql is unavailable; live PostgreSQL behavior is unverified.');
        }
        if (getenv('KOMYUT_PG_TESTS') !== '1') {
            $this->markTestSkipped('Live PostgreSQL tests require explicit KOMYUT_PG_TESTS=1 opt-in.');
        }
        $username = getenv('KOMYUT_TEST_DB_USERNAME');
        $this->assertNotEmpty($username, 'Set a dedicated local test database username.');
        $this->assertSame('testing', app()->environment());

        // Never inherit an application DB URL, host, database name, or credentials.
        config(['database.default' => 'schema_test', 'database.connections.schema_test' => [
            'driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => '5432',
            'database' => 'komyut_brick14_test', 'username' => $username,
            'password' => getenv('KOMYUT_TEST_DB_PASSWORD') ?: '', 'prefix' => '', 'sslmode' => 'prefer',
        ]]);
        $this->database = DB::connection();
        $this->database->getPdo();
        $this->assertSame('komyut_brick14_test', $this->database->scalar('SELECT current_database()'));

        $this->database->beginTransaction();
        $schema = 'komyut_test_'.bin2hex(random_bytes(8));
        $this->database->statement('CREATE SCHEMA "'.$schema.'"');
        $this->database->statement('SET LOCAL search_path TO "'.$schema.'"');
        $migration = require database_path('migrations/2026_10_12_000000_create_transport_schema.php');
        $migration->up();
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

    private function stop(string $id): TransportStop
    {
        return TransportStop::create(['id' => $id, 'name' => 'Synthetic test stop', 'type' => 'bus_stop']);
    }

    private function route(): TransportRoute
    {
        TransportOperator::create(['id' => 'test-operator', 'name' => 'Synthetic test operator']);

        return TransportRoute::create(['id' => 'test-route', 'name' => 'Synthetic test route', 'operator_id' => 'test-operator', 'vehicle_type' => 'bus']);
    }

    private function rule(array $attributes = []): FareRule
    {
        return FareRule::create(array_merge([
            'id' => 'test-fare', 'name' => 'Synthetic test fare', 'vehicle_type' => 'bus',
            'currency' => 'PHP', 'structure_type' => 'unconfigured', 'reliability' => 'unverified',
        ], $attributes));
    }

    public function test_nullable_and_boundary_coordinates_are_preserved(): void
    {
        $stop = $this->stop('test-stop');
        $this->assertNull($stop->fresh()->latitude);
        $stop->update(['latitude' => -90, 'longitude' => 180]);
        $this->assertSame(-90.0, $stop->fresh()->latitude);
        $stop->update(['latitude' => 90, 'longitude' => -180]);
        $this->assertSame(-180.0, $stop->fresh()->longitude);
    }

    public function test_out_of_range_coordinates_are_rejected(): void
    {
        $this->expectException(QueryException::class);
        $this->stop('test-stop')->update(['latitude' => 90.001, 'longitude' => 0]);
    }

    public function test_partial_coordinate_pairs_are_rejected(): void
    {
        $this->expectException(QueryException::class);
        $this->stop('test-stop')->update(['latitude' => 0]);
    }

    public function test_nonfinite_coordinates_are_rejected(): void
    {
        $stop = $this->stop('test-stop');
        $this->expectException(QueryException::class);
        DB::table('transport_stops')->where('id', $stop->id)->update(['latitude' => 'NaN', 'longitude' => 0]);
    }

    public function test_required_fields_and_closed_stop_types_are_enforced(): void
    {
        $this->expectException(QueryException::class);
        DB::table('transport_stops')->insert(['id' => 'test-stop', 'type' => 'bus_stop']);
    }

    public function test_unknown_stop_types_are_rejected(): void
    {
        $this->expectException(QueryException::class);
        DB::table('transport_stops')->insert(['id' => 'test-stop', 'name' => 'Synthetic test stop', 'type' => 'unsupported']);
    }

    public function test_invalid_operator_references_are_rejected(): void
    {
        $this->expectException(QueryException::class);
        TransportRoute::create(['id' => 'test-route', 'name' => 'Synthetic test route', 'operator_id' => 'missing', 'vehicle_type' => 'bus']);
    }

    public function test_ordered_stop_relationships_preserve_positions(): void
    {
        $route = $this->route();
        $this->stop('first');
        $this->stop('second');
        $route->routeStops()->create(['stop_id' => 'second', 'position' => 1]);
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 0]);
        $this->assertSame(['first', 'second'], $route->stops->pluck('id')->all());
    }

    public function test_duplicate_sequence_positions_are_rejected(): void
    {
        $route = $this->route();
        $this->stop('first');
        $this->stop('second');
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 0]);
        $this->expectException(QueryException::class);
        $route->routeStops()->create(['stop_id' => 'second', 'position' => 0]);
    }

    public function test_repeated_stops_in_a_route_are_rejected(): void
    {
        $route = $this->route();
        $this->stop('first');
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 0]);
        $this->expectException(QueryException::class);
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 1]);
    }

    public function test_invalid_stop_references_are_rejected(): void
    {
        $route = $this->route();
        $this->expectException(QueryException::class);
        $route->routeStops()->create(['stop_id' => 'missing', 'position' => 0]);
    }

    public function test_referenced_operator_deletion_is_restricted(): void
    {
        $this->route();
        $this->expectException(QueryException::class);
        TransportOperator::findOrFail('test-operator')->delete();
    }

    public function test_referenced_stop_updates_are_restricted(): void
    {
        $route = $this->route();
        $this->stop('first');
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 0]);
        $this->expectException(QueryException::class);
        DB::table('transport_stops')->where('id', 'first')->update(['id' => 'changed']);
    }

    public function test_referenced_stop_deletion_is_restricted(): void
    {
        $route = $this->route();
        $stop = $this->stop('first');
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 0]);
        $this->expectException(QueryException::class);
        $stop->delete();
    }

    public function test_unconfigured_fares_have_no_invented_amount(): void
    {
        $rule = $this->rule()->fresh();
        $this->assertNull($rule->amount_centavos);
        $this->assertSame('unverified', $rule->reliability);
    }

    public function test_fixed_money_remains_an_exact_integer_and_zero_is_not_unknown(): void
    {
        $rule = $this->rule(['structure_type' => 'fixed', 'amount_centavos' => 9007199254740991]);
        $this->assertSame(9007199254740991, $rule->fresh()->amount_centavos);
        $rule->update(['amount_centavos' => 0]);
        $this->assertSame(0, $rule->fresh()->amount_centavos);
    }

    public function test_distance_configuration_round_trips_exact_decimal_strings(): void
    {
        $rule = $this->rule(['structure_type' => 'distance_based', 'base_fare_centavos' => 0,
            'included_distance_km' => '0.1234567890', 'increment_distance_km' => '0.0000000001',
            'increment_amount_centavos' => 0, 'increment_rounding' => 'up']);
        $this->assertSame('0.1234567890', $rule->fresh()->included_distance_km);
    }

    public function test_unconfigured_fares_reject_pricing_fields(): void
    {
        $this->expectException(QueryException::class);
        $this->rule(['amount_centavos' => 0]);
    }

    public function test_negative_money_is_rejected(): void
    {
        $this->expectException(QueryException::class);
        $this->rule(['structure_type' => 'fixed', 'amount_centavos' => -1]);
    }

    public function test_verified_status_requires_source_and_verification_date(): void
    {
        $this->expectException(QueryException::class);
        $this->rule(['reliability' => 'verified']);
    }

    public function test_provenance_and_date_round_trip_without_claiming_real_verification(): void
    {
        $rule = $this->rule(['reliability' => 'estimated', 'source_name' => 'Synthetic test source',
            'source_notes' => 'Test fixture only, not verified transport data', 'effective_from' => '2026-10-12']);
        $this->assertSame('estimated', $rule->fresh()->reliability);
        $this->assertSame('2026-10-12', $rule->fresh()->toArray()['effective_from']);
    }

    public function test_directed_station_pair_uniqueness_and_stop_references(): void
    {
        $rule = $this->rule(['structure_type' => 'station_pair']);
        $this->stop('first');
        $this->stop('second');
        $rule->stationPairs()->create(['origin_stop_id' => 'first', 'destination_stop_id' => 'second', 'amount_centavos' => 0]);
        $rule->stationPairs()->create(['origin_stop_id' => 'second', 'destination_stop_id' => 'first', 'amount_centavos' => 0]);
        $this->assertCount(2, $rule->stationPairs);
        $this->expectException(QueryException::class);
        $rule->stationPairs()->create(['origin_stop_id' => 'first', 'destination_stop_id' => 'second', 'amount_centavos' => 0]);
    }

    public function test_stop_endpoint_searches_names_and_addresses_with_real_postgres(): void
    {
        $this->stop('first')->update(['address' => 'Synthetic Palengke landmark']);
        $this->stop('second');
        $this->getJson('/api/stops?q=pAlEnGkE&type=bus_stop')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', 'first');
        $this->getJson('/api/stops?q=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_route_endpoint_preserves_order_with_real_postgres(): void
    {
        $route = $this->route();
        $this->stop('first');
        $this->stop('second');
        $route->routeStops()->create(['stop_id' => 'second', 'position' => 1]);
        $route->routeStops()->create(['stop_id' => 'first', 'position' => 0]);
        $this->getJson('/api/routes')->assertOk()->assertJsonPath('data.0.stopIds', ['first', 'second']);
    }

    public function test_stop_endpoint_applies_limit_and_reports_more_with_real_postgres(): void
    {
        $this->stop('first');
        $this->stop('second');
        $this->getJson('/api/stops?limit=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.hasMore', true);
    }
}
