<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\FareRule;
use App\Models\FareStationPair;
use App\Models\OperatorVehicleType;
use App\Models\RouteStop;
use App\Models\TransportOperator;
use App\Models\TransportRoute;
use App\Models\TransportStop;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class TransportSchemaDefinitionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'schema_preview', 'database.connections.schema_preview' => [
            'driver' => 'pgsql', 'database' => 'unused', 'prefix' => '',
        ]]);
        DB::connection()->setPdo(fn () => throw new RuntimeException('Offline schema checks must never connect.'));
    }

    private function sql(string $direction = 'up'): string
    {
        $migration = require database_path('migrations/2026_10_12_000000_create_transport_schema.php');
        $queries = DB::connection()->pretend(fn () => $migration->$direction());

        return implode("\n", array_column($queries, 'query'));
    }

    public function test_all_seven_tables_compile_using_postgres_grammar_without_a_connection(): void
    {
        $sql = $this->sql();
        foreach (['transport_stops', 'transport_operators', 'operator_vehicle_types', 'transport_routes', 'route_stops', 'fare_rules', 'fare_station_pairs'] as $table) {
            $this->assertStringContainsString('create table "'.$table.'"', $sql);
        }
        $this->assertStringContainsString('"id" varchar(64) not null', $sql);
        $this->assertStringContainsString('timestamp(0) with time zone', $sql);
    }

    public function test_definition_has_explicit_nullable_coordinate_and_closed_type_checks(): void
    {
        $sql = $this->sql();
        $this->assertStringContainsString('"latitude" double precision null', $sql);
        $this->assertStringContainsString('latitude IS NULL AND longitude IS NULL', $sql);
        $this->assertStringContainsString('latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180', $sql);
        $this->assertStringContainsString("'transport_terminal'", $sql);
        $this->assertStringContainsString("vehicle_type IN ('bus', 'jeepney', 'train')", $sql);
    }

    public function test_references_restrict_deletion_and_update_and_ordering_is_unique(): void
    {
        $sql = $this->sql();
        $this->assertStringNotContainsString('cascade', $sql);
        $this->assertSame(8, substr_count($sql, 'on delete restrict on update restrict'));
        $this->assertStringContainsString('unique ("route_id", "position")', $sql);
        $this->assertStringContainsString('unique ("route_id", "stop_id")', $sql);
        $this->assertStringContainsString('position >= 0', $sql);
        $this->assertStringContainsString('unique ("operator_id", "vehicle_type")', $sql);
    }

    public function test_fare_columns_use_integer_money_exact_distance_and_documented_variants(): void
    {
        $sql = $this->sql();
        $this->assertStringContainsString('"amount_centavos" bigint null', $sql);
        $this->assertStringContainsString('"included_distance_km" decimal(20, 10) null', $sql);
        $this->assertStringContainsString('amount_centavos BETWEEN 0 AND 9007199254740991', $sql);
        $this->assertStringContainsString("structure_type IN ('fixed', 'distance_based', 'station_pair', 'unconfigured')", $sql);
        $this->assertStringContainsString("structure_type IN ('station_pair', 'unconfigured') AND amount_centavos IS NULL", $sql);
        $this->assertStringContainsString('unique ("fare_rule_id", "origin_stop_id", "destination_stop_id")', $sql);
    }

    public function test_provenance_and_effective_date_constraints_are_present(): void
    {
        $sql = $this->sql();
        $this->assertStringContainsString("reliability <> 'verified' OR (source_name IS NOT NULL AND verified_on IS NOT NULL)", $sql);
        $this->assertStringContainsString('effective_from <= effective_until', $sql);
        $this->assertStringContainsString('"verified_on" date null', $sql);
        $this->assertSame(4, substr_count($sql, "btrim(source_name) <> ''"));
    }

    public function test_down_compiles_in_reverse_dependency_order(): void
    {
        $sql = $this->sql('down');
        $tables = ['fare_station_pairs', 'fare_rules', 'route_stops', 'transport_routes', 'operator_vehicle_types', 'transport_operators', 'transport_stops'];
        $previous = -1;
        foreach ($tables as $table) {
            $position = strpos($sql, 'drop table if exists "'.$table.'"');
            $this->assertNotFalse($position);
            $this->assertGreaterThan($previous, $position);
            $previous = $position;
        }
    }

    public function test_migration_refuses_non_postgres_drivers_before_any_sql(): void
    {
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('getDriverName')->once()->andReturn('mysql');
        DB::shouldReceive('connection')->once()->andReturn($connection);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('The transport schema requires PostgreSQL');
        $migration = require database_path('migrations/2026_10_12_000000_create_transport_schema.php');
        $migration->up();
    }

    public function test_models_keep_string_domain_ids_and_relationship_keys_and_order(): void
    {
        foreach ([new TransportStop, new TransportOperator, new TransportRoute, new FareRule] as $model) {
            $this->assertFalse($model->getIncrementing());
            $this->assertSame('string', $model->getKeyType());
        }
        $this->assertSame('operator_id', (new TransportRoute)->operator()->getForeignKeyName());
        $this->assertSame('operator_id', (new OperatorVehicleType)->operator()->getForeignKeyName());
        $this->assertSame('operator_id', (new TransportOperator)->vehicleTypes()->getForeignKeyName());
        $this->assertSame('operator_id', (new TransportOperator)->routes()->getForeignKeyName());
        $this->assertSame('operator_id', (new TransportOperator)->fareRules()->getForeignKeyName());
        $this->assertSame('stop_id', (new TransportStop)->routeStops()->getForeignKeyName());
        $this->assertSame('route_id', (new RouteStop)->route()->getForeignKeyName());
        $this->assertSame('stop_id', (new RouteStop)->stop()->getForeignKeyName());
        $this->assertSame('fare_rule_id', (new FareStationPair)->fareRule()->getForeignKeyName());
        $this->assertSame('origin_stop_id', (new FareStationPair)->origin()->getForeignKeyName());
        $this->assertSame('destination_stop_id', (new FareStationPair)->destination()->getForeignKeyName());
        $this->assertSame('fare_rule_id', (new FareRule)->stationPairs()->getForeignKeyName());
        $this->assertStringContainsString('order by "route_stops"."position" asc', (new TransportRoute)->stops()->toSql());
        $this->assertStringContainsString('order by "position" asc', (new TransportRoute)->routeStops()->toSql());
    }

    public function test_casts_preserve_centavos_dates_decimal_strings_and_unknown_amounts(): void
    {
        // Synthetic model attributes only, not seeded fares or verified transport records.
        $rule = new FareRule(['amount_centavos' => '9007199254740991', 'included_distance_km' => '0.1234567890', 'verified_on' => '2026-10-12']);
        $this->assertSame(9007199254740991, $rule->amount_centavos);
        $this->assertSame('0.1234567890', $rule->included_distance_km);
        $this->assertSame('2026-10-12', $rule->toArray()['verified_on']);
        $unknown = new FareRule(['structure_type' => 'unconfigured', 'reliability' => 'unverified']);
        $this->assertNull($unknown->amount_centavos);
        $this->assertSame(0, (new FareStationPair(['amount_centavos' => '0']))->amount_centavos);
    }
}
