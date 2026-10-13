<?php

declare(strict_types=1);

namespace App\Services\TrainsPh;

use Illuminate\Database\Connection;

class TrainImporter
{
    private const LOCAL_TARGETS = ['komyut' => '5433', 'komyut_local' => '5432'];

    public function assertTarget(Connection $database, bool $apply, ?string $confirmation): void
    {
        $testing = app()->environment('testing');
        $config = $database->getConfig();
        $expected = $testing ? 'komyut_brick14_test' : ($config['database'] ?? '');
        $port = (string) ($config['port'] ?? '');
        $schema = $config['search_path'] ?? 'public';
        if (! app()->environment('local', 'testing') || ($config['driver'] ?? null) !== 'pgsql' ||
            ! in_array($config['host'] ?? null, ['127.0.0.1', 'localhost', '::1'], true) ||
            ($testing ? ! in_array($port, ['5432', '5433'], true) : (self::LOCAL_TARGETS[$expected] ?? null) !== $port) || ($config['database'] ?? null) !== $expected ||
            ! empty($config['url']) || isset($config['read']) || isset($config['write']) ||
            (! $testing && $schema !== 'public') ||
            ($testing && (! is_string($schema) || ! preg_match('/^komyut_test_[a-f0-9]+$/', $schema) || getenv('KOMYUT_PG_TESTS') !== '1'))) {
            throw new ImportSafetyException('Refused target: require local PostgreSQL on loopback, komyut:5433/public or komyut_local:5432/public, no URL or read/write overrides. Tests require the opted-in isolated test target.');
        }
        if ($apply && $confirmation !== $expected) {
            throw new ImportSafetyException('Apply requires --confirm-local='.$expected.' after reviewing the local database target.');
        }
    }

    /** @return array{counts: array, conflicts: list<string>} */
    public function run(Connection $database, array $records, bool $apply = false, ?string $confirmation = null): array
    {
        $this->assertTarget($database, $apply, $confirmation);

        return $database->transaction(function () use ($database, $records, $apply): array {
            // Standalone previews are enforced read-only and use one consistent snapshot.
            if (! $apply && $database->transactionLevel() === 1) {
                $database->statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            }
            $identity = $database->selectOne('SELECT current_database() AS database, current_schema() AS schema');
            if ($identity->database !== $database->getConfig('database') || $identity->schema !== ($database->getConfig('search_path') ?? 'public')) {
                throw new ImportSafetyException('Connected database/schema does not match the reviewed local target.');
            }
            // Transaction-scoped lock releases automatically on success or rollback.
            if (! $database->selectOne('SELECT pg_try_advisory_xact_lock(1263490393, 1) AS acquired')->acquired) {
                throw new ImportSafetyException('Another TrainsPh import is running; retry later.');
            }
            if ($apply) {
                $database->statement('LOCK TABLE transport_operators, operator_vehicle_types, transport_stops, transport_routes, route_stops IN SHARE ROW EXCLUSIVE MODE');
            }
            $summary = ['counts' => [], 'conflicts' => []];
            $changes = [];
            foreach (['transport_operators', 'transport_stops', 'transport_routes'] as $table) {
                $summary['counts'][$table] = ['created' => 0, 'updated' => 0, 'unchanged' => 0, 'conflicting' => 0];
                foreach ($records[$table] as $record) {
                    $old = $database->table($table)->where('id', $record['id'])->first();
                    if ($old !== null && ($old->source_name !== 'TrainsPh' || ! str_starts_with($old->source_notes ?? '', TrainSnapshotParser::OWNER."\n"))) {
                        $summary['counts'][$table]['conflicting']++;
                        $summary['conflicts'][] = $table.': '.$record['id'].' is not owned by this importer.';

                        continue;
                    }
                    $status = $old === null ? 'created' : ($this->equal($record, (array) $old) ? 'unchanged' : 'updated');
                    $summary['counts'][$table][$status]++;
                    if ($status !== 'unchanged') {
                        $changes[] = [$table, $status, $record];
                    }
                }
            }
            $summary['counts']['operator_vehicle_types'] = ['created' => 0, 'updated' => 0, 'unchanged' => 0, 'conflicting' => 0];
            foreach ($records['operator_vehicle_types'] as $association) {
                $exists = $database->table('operator_vehicle_types')->where($association)->exists();
                $summary['counts']['operator_vehicle_types'][$exists ? 'unchanged' : 'created']++;
                if (! $exists) {
                    $changes[] = ['operator_vehicle_types', 'created', $association];
                }
            }
            $sequences = [];
            $summary['counts']['route_stops'] = ['created' => 0, 'updated' => 0, 'unchanged' => 0, 'conflicting' => 0];
            foreach ($records['transport_routes'] as $route) {
                $desired = array_values(array_filter($records['route_stops'], fn (array $row): bool => $row['route_id'] === $route['id']));
                $current = $database->table('route_stops')->where('route_id', $route['id'])->orderBy('position')->get(['route_id', 'stop_id', 'position'])->map(fn ($row): array => (array) $row)->all();
                if ($desired === $current) {
                    $summary['counts']['route_stops']['unchanged'] += count($desired);
                } else {
                    $summary['counts']['route_stops'][$current === [] ? 'created' : 'updated'] += count($desired);
                    $sequences[$route['id']] = $desired;
                }
            }
            // Do not apply any partial import if even one parent has an ownership conflict.
            if (! $apply || $summary['conflicts'] !== []) {
                return $summary;
            }
            $now = now();
            foreach ($changes as [$table, $status, $record]) {
                if ($table === 'operator_vehicle_types') {
                    $database->table($table)->insert($record);
                } elseif ($status === 'created') {
                    $database->table($table)->insert($record + ['created_at' => $now, 'updated_at' => $now]);
                } else {
                    $database->table($table)->where('id', $record['id'])->update($record + ['updated_at' => $now]);
                }
            }
            foreach ($sequences as $routeId => $rows) {
                // Replace only an owned route's children, avoiding transient position collisions.
                $database->table('route_stops')->where('route_id', $routeId)->delete();
                $database->table('route_stops')->insert($rows);
            }

            return $summary;
        });
    }

    private function equal(array $desired, array $current): bool
    {
        foreach ($desired as $key => $value) {
            $old = $current[$key] ?? null;
            if (in_array($key, ['latitude', 'longitude'], true) && $old !== null) {
                $old = (float) $old;
            }
            if ($value !== $old) {
                return false;
            }
        }

        return true;
    }
}
