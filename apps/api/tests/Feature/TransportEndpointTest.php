<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\RouteStop;
use App\Models\TransportRoute;
use App\Models\TransportStop;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Mockery;
use PDOException;
use RuntimeException;
use Tests\TestCase;

class TransportEndpointTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'preview', 'database.connections.preview' => ['driver' => 'pgsql', 'database' => 'unused', 'prefix' => '']]);
        DB::connection()->setPdo(fn () => throw new RuntimeException('Endpoint contract tests must not connect.'));
    }

    private function results(string $class, array $records): Builder
    {
        $model = new $class;
        $builder = Mockery::mock(Builder::class, [$model->newQuery()->getQuery()])->makePartial();
        $builder->setModel($model);
        $builder->shouldReceive('get')->once()->andReturn(new Collection($records));
        $injected = Mockery::mock($class)->makePartial();
        $injected->shouldReceive('newQuery')->once()->andReturn($builder);
        $this->instance($class, $injected);

        return $builder;
    }

    public function test_stops_return_only_needed_fields_and_optional_provenance(): void
    {
        $stop = new TransportStop(['id' => 'synthetic-stop', 'name' => 'Synthetic test stop', 'type' => 'bus_stop',
            'latitude' => 0, 'longitude' => 0, 'address' => 'Test fixture only',
            'source_name' => 'Synthetic test fixture', 'source_notes' => 'Not verified travel data']);
        $this->results(TransportStop::class, [$stop]);
        $this->getJson('/api/stops')->assertOk()->assertExactJson([
            'data' => [['id' => 'synthetic-stop', 'name' => 'Synthetic test stop', 'type' => 'bus_stop',
                'location' => ['latitude' => 0, 'longitude' => 0], 'address' => 'Test fixture only',
                'source' => ['sourceName' => 'Synthetic test fixture', 'notes' => 'Not verified travel data']]],
            'meta' => ['limit' => 50, 'hasMore' => false],
        ]);
    }

    public function test_empty_stops_are_not_replaced_with_sample_records(): void
    {
        $this->results(TransportStop::class, []);
        $this->getJson('/api/stops')->assertOk()->assertExactJson(['data' => [], 'meta' => ['limit' => 50, 'hasMore' => false]]);
    }

    public function test_stop_search_is_bound_case_insensitive_literal_and_limited(): void
    {
        $stop = new TransportStop(['id' => 'test', 'name' => 'Synthetic test stop', 'type' => 'bus_stop']);
        $builder = $this->results(TransportStop::class, [$stop, new TransportStop(['id' => 'second', 'name' => 'Synthetic second stop', 'type' => 'bus_stop'])]);
        $this->getJson('/api/stops?'.http_build_query(['q' => '  %_Test  ', 'type' => 'bus_stop', 'limit' => 1]))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.hasMore', true);
        $this->assertStringContainsString('"name"::text ilike ?', $builder->toSql());
        $this->assertStringContainsString('"address"::text ilike ?', $builder->toSql());
        $this->assertSame(['%\\%\\_Test%', '%\\%\\_Test%', 'bus_stop'], $builder->getBindings());
        $this->assertStringContainsString('order by "id" asc limit 2', $builder->toSql());
    }

    public function test_stops_validate_queries_before_requesting_data(): void
    {
        foreach (['q[]=invalid', 'q='.str_repeat('x', 121), 'type=unsupported', 'limit=0', 'limit=101', 'limit=1.5'] as $query) {
            $this->getJson('/api/stops?'.$query)->assertUnprocessable();
        }
    }

    public function test_routes_return_ordered_stop_ids_and_eager_load_the_relationship(): void
    {
        $route = new TransportRoute(['id' => 'synthetic-route', 'name' => 'Synthetic test route', 'operator_id' => 'synthetic-operator', 'vehicle_type' => 'bus']);
        $route->setRelation('routeStops', new Collection([new RouteStop(['stop_id' => 'first', 'position' => 0]), new RouteStop(['stop_id' => 'second', 'position' => 1])]));
        $builder = $this->results(TransportRoute::class, [$route]);
        $this->getJson('/api/routes')->assertOk()->assertExactJson([
            'data' => [['id' => 'synthetic-route', 'name' => 'Synthetic test route', 'operatorId' => 'synthetic-operator', 'vehicleType' => 'bus', 'stopIds' => ['first', 'second']]],
            'meta' => ['limit' => 50, 'hasMore' => false],
        ]);
        $this->assertArrayHasKey('routeStops', $builder->getEagerLoads());
    }

    public function test_routes_validate_limits_and_support_empty_results(): void
    {
        $this->results(TransportRoute::class, []);
        $this->getJson('/api/routes?limit=101')->assertUnprocessable();
        $this->getJson('/api/routes?limit=5')->assertOk()->assertExactJson(['data' => [], 'meta' => ['limit' => 5, 'hasMore' => false]]);
    }

    public function test_database_failures_return_sanitized_503_even_with_debug_enabled(): void
    {
        config(['app.debug' => true]);
        foreach ([TransportStop::class => 'stops', TransportRoute::class => 'routes'] as $class => $path) {
            $model = Mockery::mock($class)->makePartial();
            $model->shouldReceive('newQuery')->once()->andThrow(new PDOException('Sensitive connection diagnostic'));
            $this->instance($class, $model);
            $this->getJson('/api/'.$path)->assertStatus(503)->assertExactJson([
                'error' => ['code' => 'transport_unavailable', 'message' => 'Transport data is currently unavailable.'],
            ]);
        }
    }

    public function test_undefined_database_connection_returns_safe_errors_without_breaking_health_or_validation(): void
    {
        config(['database.default' => 'unconfigured', 'database.connections.unconfigured' => null, 'app.debug' => true]);

        foreach (['stops', 'routes'] as $path) {
            $this->getJson('/api/'.$path)->assertStatus(503)->assertExactJson([
                'error' => ['code' => 'transport_unavailable', 'message' => 'Transport data is currently unavailable.'],
            ]);
        }

        $this->getJson('/api/health')->assertOk()->assertExactJson(['service' => 'komyut-api', 'status' => 'ok']);
        $this->getJson('/api/stops?limit=101')->assertUnprocessable();
        $this->getJson('/api/routes?limit=101')->assertUnprocessable();
    }

    public function test_write_methods_are_not_available(): void
    {
        $this->postJson('/api/stops')->assertStatus(405);
        $this->postJson('/api/routes')->assertStatus(405);
    }
}
