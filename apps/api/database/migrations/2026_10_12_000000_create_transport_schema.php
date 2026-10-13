<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->requirePostgres();

        Schema::create('transport_stops', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('name');
            $table->string('type', 24);
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->text('address')->nullable();
            $this->sourceColumns($table);
            $table->timestampsTz();
            $table->index('type');
        });
        $this->checks('transport_stops', [
            'identity' => "btrim(id) <> '' AND btrim(name) <> ''",
            'type' => "type IN ('bus_stop', 'jeepney_stop', 'train_station', 'transport_terminal')",
            'coordinates' => '(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)',
        ]);
        $this->sourceCheck('transport_stops');

        Schema::create('transport_operators', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('name');
            $this->sourceColumns($table);
            $table->timestampsTz();
        });
        $this->checks('transport_operators', ['identity' => "btrim(id) <> '' AND btrim(name) <> ''"]);
        $this->sourceCheck('transport_operators');

        Schema::create('operator_vehicle_types', function (Blueprint $table): void {
            $table->id();
            $table->string('operator_id', 64);
            $table->string('vehicle_type', 16);
            $table->foreign('operator_id')->references('id')->on('transport_operators')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['operator_id', 'vehicle_type']);
        });
        $this->checks('operator_vehicle_types', ['vehicle_type' => "vehicle_type IN ('bus', 'jeepney', 'train')"]);

        Schema::create('transport_routes', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('name');
            $table->string('operator_id', 64);
            $table->string('vehicle_type', 16);
            $this->sourceColumns($table);
            $table->timestampsTz();
            $table->foreign('operator_id')->references('id')->on('transport_operators')->restrictOnDelete()->restrictOnUpdate();
            $table->index('operator_id');
            $table->index('vehicle_type');
        });
        $this->checks('transport_routes', [
            'identity' => "btrim(id) <> '' AND btrim(name) <> ''",
            'vehicle_type' => "vehicle_type IN ('bus', 'jeepney', 'train')",
        ]);
        $this->sourceCheck('transport_routes');

        Schema::create('route_stops', function (Blueprint $table): void {
            $table->id();
            $table->string('route_id', 64);
            $table->string('stop_id', 64);
            $table->integer('position');
            $table->foreign('route_id')->references('id')->on('transport_routes')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('stop_id')->references('id')->on('transport_stops')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['route_id', 'position']);
            $table->unique(['route_id', 'stop_id']);
            $table->index('stop_id');
        });
        $this->checks('route_stops', ['position' => 'position >= 0']);

        Schema::create('fare_rules', function (Blueprint $table): void {
            $table->string('id', 64)->primary();
            $table->string('name');
            $table->string('operator_id', 64)->nullable();
            $table->string('vehicle_type', 16);
            $table->char('currency', 3);
            $table->string('structure_type', 20);
            $table->bigInteger('amount_centavos')->nullable();
            $table->bigInteger('base_fare_centavos')->nullable();
            $table->decimal('included_distance_km', 20, 10)->nullable();
            $table->bigInteger('minimum_fare_centavos')->nullable();
            $table->decimal('increment_distance_km', 20, 10)->nullable();
            $table->bigInteger('increment_amount_centavos')->nullable();
            $table->string('increment_rounding', 8)->nullable();
            $table->string('reliability', 16);
            $this->sourceColumns($table);
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
            $table->timestampsTz();
            $table->foreign('operator_id')->references('id')->on('transport_operators')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['operator_id', 'vehicle_type']);
            $table->index('vehicle_type');
        });
        $this->checks('fare_rules', [
            'identity' => "btrim(id) <> '' AND btrim(name) <> ''",
            'vehicle_type' => "vehicle_type IN ('bus', 'jeepney', 'train')",
            'currency' => "currency = 'PHP'",
            'structure_type' => "structure_type IN ('fixed', 'distance_based', 'station_pair', 'unconfigured')",
            'reliability' => "reliability IN ('verified', 'estimated', 'unverified')",
            'verification' => "reliability <> 'verified' OR (source_name IS NOT NULL AND verified_on IS NOT NULL)",
            'effective_dates' => 'effective_from IS NULL OR effective_until IS NULL OR effective_from <= effective_until',
            'included_distance' => 'included_distance_km BETWEEN 0 AND 9999999999.9999999999',
            'increment_distance' => 'increment_distance_km > 0 AND increment_distance_km <= 9999999999.9999999999',
            'increment_rounding' => "increment_rounding IN ('up', 'down', 'nearest')",
            'variant' => <<<'SQL'
                (structure_type = 'fixed' AND amount_centavos IS NOT NULL
                    AND base_fare_centavos IS NULL AND included_distance_km IS NULL AND minimum_fare_centavos IS NULL
                    AND increment_distance_km IS NULL AND increment_amount_centavos IS NULL AND increment_rounding IS NULL)
                OR (structure_type = 'distance_based' AND amount_centavos IS NULL
                    AND base_fare_centavos IS NOT NULL AND included_distance_km IS NOT NULL
                    AND increment_distance_km IS NOT NULL AND increment_amount_centavos IS NOT NULL AND increment_rounding IS NOT NULL)
                OR (structure_type IN ('station_pair', 'unconfigured') AND amount_centavos IS NULL
                    AND base_fare_centavos IS NULL AND included_distance_km IS NULL AND minimum_fare_centavos IS NULL
                    AND increment_distance_km IS NULL AND increment_amount_centavos IS NULL AND increment_rounding IS NULL)
                SQL,
        ]);
        foreach (['amount_centavos', 'base_fare_centavos', 'minimum_fare_centavos', 'increment_amount_centavos'] as $column) {
            $this->checks('fare_rules', [$column => "$column BETWEEN 0 AND 9007199254740991"]);
        }
        $this->sourceCheck('fare_rules');

        Schema::create('fare_station_pairs', function (Blueprint $table): void {
            $table->id();
            $table->string('fare_rule_id', 64);
            $table->string('origin_stop_id', 64);
            $table->string('destination_stop_id', 64);
            $table->bigInteger('amount_centavos');
            $table->foreign('fare_rule_id')->references('id')->on('fare_rules')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('origin_stop_id')->references('id')->on('transport_stops')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('destination_stop_id')->references('id')->on('transport_stops')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['fare_rule_id', 'origin_stop_id', 'destination_stop_id'], 'fare_station_pairs_directed_unique');
            $table->index('origin_stop_id');
            $table->index('destination_stop_id');
        });
        $this->checks('fare_station_pairs', ['amount' => 'amount_centavos BETWEEN 0 AND 9007199254740991']);
    }

    public function down(): void
    {
        $this->requirePostgres();
        foreach (['fare_station_pairs', 'fare_rules', 'route_stops', 'transport_routes', 'operator_vehicle_types', 'transport_operators', 'transport_stops'] as $table) {
            Schema::dropIfExists($table);
        }
    }

    private function requirePostgres(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            throw new RuntimeException('The transport schema requires PostgreSQL; no database fallback is supported.');
        }
    }

    private function sourceColumns(Blueprint $table): void
    {
        $table->string('source_name')->nullable();
        $table->text('source_url')->nullable();
        $table->date('verified_on')->nullable();
        $table->text('source_notes')->nullable();
    }

    private function sourceCheck(string $table): void
    {
        $this->checks($table, ['source' => "(source_name IS NULL AND source_url IS NULL AND verified_on IS NULL AND source_notes IS NULL) OR (source_name IS NOT NULL AND btrim(source_name) <> '')"]);
    }

    /** @param array<string, string> $checks */
    private function checks(string $table, array $checks): void
    {
        foreach ($checks as $name => $expression) {
            DB::statement("ALTER TABLE $table ADD CONSTRAINT {$table}_{$name}_check CHECK ($expression)");
        }
    }
};
