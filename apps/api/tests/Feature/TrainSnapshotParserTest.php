<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\TrainsPh\TrainSnapshotParser;
use Illuminate\Validation\ValidationException;
use JsonException;
use Tests\TestCase;
use UnexpectedValueException;

class TrainSnapshotParserTest extends TestCase
{
    private function bundle(): array
    {
        $path = database_path('data/trainsph/2026-10-07/');
        $files = [];
        foreach (['lrt1', 'lrt2', 'mrt3'] as $id) {
            $files[$id] = file_get_contents($path.$id.'.json');
        }

        return [json_decode(file_get_contents($path.'manifest.json'), true), $files];
    }

    public function test_all_three_pinned_datasets_project_only_phase_one_records(): void
    {
        $records = (new TrainSnapshotParser)->load();
        $this->assertSame(['transport_operators', 'operator_vehicle_types', 'transport_stops', 'transport_routes', 'route_stops'], array_keys($records));
        $this->assertCount(51, $records['transport_stops']);
        $this->assertCount(3, $records['transport_operators']);
        $this->assertCount(3, $records['operator_vehicle_types']);
        $this->assertCount(3, $records['transport_routes']);
        $this->assertCount(51, $records['route_stops']);
        $this->assertSame('lrt1_fernando_poe_jr', $records['transport_stops'][0]['id']);
        $this->assertSame('trainsph-lrt1-canonical', $records['transport_routes'][0]['id']);
        $this->assertSame(['id' => 'trainsph-lrmc', 'name' => 'Light Rail Manila Corporation (LRMC)'], array_intersect_key($records['transport_operators'][0], array_flip(['id', 'name'])));
        foreach (['transport_stops', 'transport_operators', 'transport_routes'] as $table) {
            foreach ($records[$table] as $record) {
                $this->assertNull($record['verified_on']);
                $this->assertStringContainsString(TrainSnapshotParser::ATTRIBUTION, $record['source_notes']);
                $this->assertStringContainsString('2026-09-18', $record['source_notes']);
            }
        }
        $this->assertStringContainsString('2026-09-20', $records['transport_stops'][0]['source_notes']);
    }

    public function test_malformed_or_unexpected_records_are_rejected_before_projection(): void
    {
        $mutations = [
            'schema' => fn (array &$d) => $d['schema_version'] = 2,
            'line identity' => fn (array &$d) => $d['line']['id'] = 'mrt3',
            'line identity type' => fn (array &$d) => $d['line']['id'] = true,
            'operator identity' => fn (array &$d) => $d['line']['operator'] = 'Unreviewed operator',
            'station name' => fn (array &$d) => $d['stations'][0]['name'] = '   ',
            'coordinate range' => fn (array &$d) => $d['stations'][0]['lat'] = 91,
            'coordinate type' => fn (array &$d) => $d['stations'][0]['lng'] = '121.01',
            'missing coordinate' => function (array &$d): void {
                unset($d['stations'][0]['lat']);
            },
            'duplicate id' => fn (array &$d) => $d['stations'][1]['id'] = $d['stations'][0]['id'],
            'missing reference' => fn (array &$d) => $d['stations'][9]['interchanges'][0]['station_id'] = 'not-a-station',
            'wrong line reference' => fn (array &$d) => $d['stations'][9]['interchanges'][0]['line_id'] = 'mrt3',
            'ordinal gap' => fn (array &$d) => $d['stations'][0]['ordinal'] = 99,
            'ordinal type' => fn (array &$d) => $d['stations'][0]['ordinal'] = '1',
            'missing metadata' => function (array &$d): void {
                unset($d['provenance']['source_url']);
            },
            'invalid date' => fn (array &$d) => $d['provenance']['verified_on'] = '2026-02-30',
            'manifest date disagreement' => fn (array &$d) => $d['provenance']['verified_on'] = '2026-09-19',
            'fare label reference' => fn (array &$d) => $d['fares']['station_order'][0] = 'Missing station',
            'unexpected station field' => fn (array &$d) => $d['stations'][0]['unsupported'] = true,
        ];
        foreach ($mutations as $label => $mutate) {
            [$manifest, $files] = $this->bundle();
            $data = json_decode($files['lrt1'], true);
            $mutate($data);
            $files['lrt1'] = json_encode($data, JSON_THROW_ON_ERROR);
            $manifest['lines'][0]['sha256'] = hash('sha256', $files['lrt1']);
            $manifest['lines'][0]['bytes'] = strlen($files['lrt1']);
            try {
                (new TrainSnapshotParser)->parse(json_encode($manifest), $files);
                $this->fail('Accepted invalid '.$label);
            } catch (ValidationException|UnexpectedValueException $exception) {
                $this->assertNotEmpty($exception->getMessage(), $label);
            }
        }
    }

    public function test_hash_mismatch_is_rejected(): void
    {
        [$manifest, $files] = $this->bundle();
        $files['lrt1'] .= ' ';
        $this->expectException(UnexpectedValueException::class);
        $this->expectExceptionMessage('hash/byte count');
        (new TrainSnapshotParser)->parse(json_encode($manifest), $files);
    }

    public function test_malformed_json_is_rejected(): void
    {
        $this->expectException(JsonException::class);
        (new TrainSnapshotParser)->parse('{', []);
    }

    public function test_missing_line_and_license_changes_are_rejected(): void
    {
        [$manifest, $files] = $this->bundle();
        unset($files['mrt3']);
        try {
            (new TrainSnapshotParser)->parse(json_encode($manifest), $files);
            $this->fail('Accepted missing line');
        } catch (UnexpectedValueException $exception) {
            $this->assertStringContainsString('exactly', $exception->getMessage());
        }
        [$manifest, $files] = $this->bundle();
        $manifest['license']['id'] = 'Unknown';
        $this->expectException(ValidationException::class);
        (new TrainSnapshotParser)->parse(json_encode($manifest), $files);
    }
}
