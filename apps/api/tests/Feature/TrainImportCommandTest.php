<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\TrainsPh\ImportSafetyException;
use App\Services\TrainsPh\TrainImporter;
use Illuminate\Database\PostgresConnection;
use Illuminate\Support\Facades\DB;
use Mockery;
use PDOException;
use Tests\TestCase;

class TrainImportCommandTest extends TestCase
{
    private function connection(array $overrides = []): PostgresConnection
    {
        return new PostgresConnection(fn () => throw new PDOException('Must not connect in safety tests'), '', '', array_replace([
            'driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => '5432', 'database' => 'komyut_local', 'search_path' => 'public',
        ], $overrides));
    }

    public function test_apply_requires_exact_confirmation_before_any_connection(): void
    {
        $this->app['env'] = 'local';
        foreach ([null, '', 'yes', 'production'] as $confirmation) {
            try {
                (new TrainImporter)->run($this->connection(), [], true, $confirmation);
                $this->fail('Accepted ambiguous confirmation');
            } catch (ImportSafetyException $exception) {
                $this->assertStringContainsString('--confirm-local=komyut_local', $exception->getMessage());
            }
        }
    }

    public function test_unsafe_or_ambiguous_targets_are_refused_without_connecting(): void
    {
        $this->app['env'] = 'local';
        foreach ([['driver' => 'sqlite'], ['host' => 'remote.example'], ['host' => ['127.0.0.1']], ['database' => 'production'],
            ['port' => '5433'], ['url' => 'pgsql://example'], ['read' => []], ['write' => []], ['search_path' => 'other']] as $override) {
            try {
                (new TrainImporter)->assertTarget($this->connection($override), true, 'komyut_local');
                $this->fail('Accepted unsafe target');
            } catch (ImportSafetyException $exception) {
                $this->assertStringContainsString('Refused target', $exception->getMessage());
            }
        }
        $this->app['env'] = 'production';
        $this->expectException(ImportSafetyException::class);
        (new TrainImporter)->assertTarget($this->connection(), true, 'komyut_local');
    }

    public function test_both_reviewed_local_targets_pass_the_guard_without_connecting(): void
    {
        $this->app['env'] = 'local';
        $importer = new TrainImporter;
        $importer->assertTarget($this->connection(), true, 'komyut_local');
        $importer->assertTarget($this->connection(['database' => 'komyut', 'port' => '5433']), true, 'komyut');
        $this->addToAssertionCount(2);
    }

    public function test_command_defaults_to_preview_and_reports_summary(): void
    {
        $service = Mockery::mock(TrainImporter::class);
        $service->shouldReceive('run')->once()->withArgs(fn ($db, $records, $apply, $confirmation): bool => count($records['transport_stops']) === 51 && $apply === false && $confirmation === null)
            ->andReturn(['counts' => ['transport_stops' => ['created' => 51, 'updated' => 0, 'unchanged' => 0, 'conflicting' => 0]], 'conflicts' => []]);
        $this->instance(TrainImporter::class, $service);
        DB::shouldReceive('connection')->once()->andReturn($this->connection());
        $this->artisan('transport:import-trainsph')->expectsOutput('DRY RUN: no database records will be written.')->assertSuccessful();
    }

    public function test_command_does_not_expose_database_errors(): void
    {
        DB::shouldReceive('connection')->once()->andThrow(new PDOException('Sensitive diagnostic not for output'));
        $this->artisan('transport:import-trainsph')->expectsOutput('Import unavailable or failed; no partial import committed. Check private Laravel logs.')->assertFailed();
    }
}
