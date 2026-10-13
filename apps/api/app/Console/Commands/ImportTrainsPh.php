<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\TrainsPh\ImportSafetyException;
use App\Services\TrainsPh\TrainImporter;
use App\Services\TrainsPh\TrainSnapshotParser;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use JsonException;
use Throwable;
use UnexpectedValueException;

class ImportTrainsPh extends Command
{
    protected $signature = 'transport:import-trainsph {--apply : Write the reviewed records} {--confirm-local= : Explicit local database name confirmation}';

    protected $description = 'Inspect or import pinned TrainsPh stations and canonical rail routes only';

    public function handle(TrainSnapshotParser $parser, TrainImporter $importer): int
    {
        try {
            $records = $parser->load();
            $apply = (bool) $this->option('apply');
            $this->info($apply ? 'APPLY: pinned TrainsPh phase-one data.' : 'DRY RUN: no database records will be written.');
            $this->line('Snapshot 2026-10-07: 51 stations, 3 operators, 3 canonical routes. No fares or transfers.');
            $database = DB::connection();
            $summary = $importer->run($database, $records, $apply, $this->option('confirm-local'));
            $rows = [];
            foreach ($summary['counts'] as $table => $counts) {
                $rows[] = [$table, ...array_values($counts)];
            }
            $this->table(['Table', 'Created', 'Updated', 'Unchanged', 'Conflicting'], $rows);
            foreach ($summary['conflicts'] as $conflict) {
                $this->error($conflict);
            }
            if ($summary['conflicts'] !== []) {
                $this->error('Import refused: ownership conflicts. No records written.');

                return self::FAILURE;
            }
            $this->info($apply ? 'Import committed.' : 'Preview only. Apply requires --apply --confirm-local='.$database->getConfig('database').'.');

            return self::SUCCESS;
        } catch (ValidationException $exception) {
            foreach ($exception->errors() as $field => $messages) {
                $this->error($field.': '.implode(' ', $messages));
            }
        } catch (JsonException|UnexpectedValueException $exception) {
            $this->error('Snapshot validation failed: '.$exception->getMessage());
        } catch (ImportSafetyException $exception) {
            $this->error($exception->getMessage());
        } catch (Throwable $exception) {
            report($exception);
            $this->error('Import unavailable or failed; no partial import committed. Check private Laravel logs.');
        }

        return self::FAILURE;
    }
}
