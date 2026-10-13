<?php

declare(strict_types=1);

namespace App\Services\TrainsPh;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use UnexpectedValueException;

class TrainSnapshotParser
{
    public const MANIFEST_HASH = '87528f9a13b9419e6004bf44f22f98a779152512f9bdd11a2148f99e1eed37a3';

    public const ATTRIBUTION = 'Fare and station data: TrainsPh (https://trains.ph), CC BY 4.0';

    public const OWNER = 'Komyut importer: trainsph-rail-v1';

    private const LINES = [
        'lrt1' => ['LRT-1', 'LRT Line 1', 'Light Rail Manila Corporation (LRMC)', 'trainsph-lrmc'],
        'lrt2' => ['LRT-2', 'LRT Line 2', 'Light Rail Transit Authority (LRTA)', 'trainsph-lrta'],
        'mrt3' => ['MRT-3', 'MRT Line 3', 'DOTr-MRT3', 'trainsph-dotr-mrt3'],
    ];

    public function load(): array
    {
        $directory = database_path('data/trainsph/2026-10-07');
        $manifest = $this->read($directory.'/manifest.json');
        if (! hash_equals(self::MANIFEST_HASH, hash('sha256', $manifest))) {
            throw new UnexpectedValueException('Pinned manifest hash mismatch; review a new snapshot before accepting it.');
        }
        $files = [];
        foreach (array_keys(self::LINES) as $line) {
            $files[$line] = $this->read($directory.'/'.$line.'.json');
        }

        return $this->parse($manifest, $files);
    }

    /** Validate original JSON bytes before projecting only phase-one records. */
    public function parse(string $manifestJson, array $files): array
    {
        $manifest = json_decode($manifestJson, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($manifest)) {
            throw new UnexpectedValueException('Manifest must be an object.');
        }
        Validator::make($manifest, [
            'schema_version' => ['required', 'integer', 'in:1'],
            'generated_on' => ['required', 'date_format:Y-m-d'],
            'license.id' => ['required', 'in:CC-BY-4.0'],
            'license.url' => ['required', 'in:https://creativecommons.org/licenses/by/4.0/'],
            'license.attribution' => ['required', Rule::in([self::ATTRIBUTION])],
            'lines' => ['required', 'array', 'size:3'],
            'lines.*.id' => ['required', 'string', 'distinct'],
            'lines.*.sha256' => ['required', 'regex:/^[a-f0-9]{64}$/'],
            'lines.*.bytes' => ['required', 'integer', 'min:1'],
            'lines.*.verified_on' => ['required', 'date_format:Y-m-d'],
            'lines.*.fares_effective_from' => ['required', 'date_format:Y-m-d'],
        ])->validate();
        if ($manifest['schema_version'] !== 1 || array_diff(array_keys($files), array_keys(self::LINES)) !== [] || count($files) !== 3) {
            throw new UnexpectedValueException('Expected schema version 1 and exactly lrt1, lrt2 and mrt3 snapshots.');
        }
        $entries = array_column($manifest['lines'], null, 'id');
        $records = ['transport_operators' => [], 'operator_vehicle_types' => [], 'transport_stops' => [], 'transport_routes' => [], 'route_stops' => []];
        $documents = [];
        $stationIds = [];
        foreach (self::LINES as $id => [$code, $name, $operator, $operatorId]) {
            $entry = $entries[$id] ?? null;
            $bytes = $files[$id] ?? null;
            if ($entry === null || ! is_string($bytes) || strlen($bytes) !== $entry['bytes'] || ! hash_equals($entry['sha256'], hash('sha256', $bytes))) {
                throw new UnexpectedValueException($id.': snapshot hash/byte count does not match manifest.');
            }
            $data = json_decode($bytes, true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($data)) {
                throw new UnexpectedValueException($id.': snapshot must be an object.');
            }
            $this->validateLine($data);
            if ($data['schema_version'] !== 1 || $data['line'] != [
                'id' => $id, 'code' => $code, 'name' => $name, 'operator' => $operator,
                'status' => 'operational', 'color' => $data['line']['color'],
            ]) {
                throw new UnexpectedValueException($id.': unexpected line identity, operator, status or line fields.');
            }
            $provenance = $data['provenance'];
            if ($provenance['generated_on'] !== $manifest['generated_on'] || $provenance['verified_on'] !== $entry['verified_on'] || $provenance['fares_effective_from'] !== $entry['fares_effective_from']) {
                throw new UnexpectedValueException($id.': provenance dates disagree with manifest.');
            }
            $source = [
                'source_name' => 'TrainsPh', 'source_url' => 'https://trainsph-data.web.app/'.$id.'.json',
                'verified_on' => null,
                'source_notes' => self::OWNER."\n".self::ATTRIBUTION."\n".
                    'Source generated_on: '.$provenance['generated_on'].'; source fare verified_on: '.$provenance['verified_on']." (TrainsPh claim, not Komyut verification).\n".
                    'Underlying fare source: '.$provenance['source_url']."\n".
                    'Snapshot SHA-256: '.$entry['sha256'].'; fares/products/modifiers/transfers are not imported.',
            ];
            $records['transport_operators'][] = ['id' => $operatorId, 'name' => $operator] + $source;
            $records['operator_vehicle_types'][] = ['operator_id' => $operatorId, 'vehicle_type' => 'train'];
            $routeId = 'trainsph-'.$id.'-canonical';
            $records['transport_routes'][] = ['id' => $routeId, 'name' => $name.' (canonical order)', 'operator_id' => $operatorId, 'vehicle_type' => 'train'] +
                array_replace($source, ['source_notes' => $source['source_notes']."\nCanonical ascending source ordinal only; no reverse service is inferred."]);
            $stations = $data['stations'];
            usort($stations, fn (array $a, array $b): int => $a['ordinal'] <=> $b['ordinal']);
            $names = [];
            foreach ($stations as $position => $station) {
                $stationId = $station['id'];
                if (! preg_match('/^'.preg_quote($id, '/').'_[a-z0-9_]+$/', $stationId) || isset($stationIds[$stationId])) {
                    throw new UnexpectedValueException($id.': station ID is invalid or duplicated.');
                }
                if ($station['ordinal'] !== $position + 1 || isset($names[$station['name']])) {
                    throw new UnexpectedValueException($id.': ordinals must be contiguous and station names unambiguous.');
                }
                $stationIds[$stationId] = $id;
                $names[$station['name']] = true;
                $stationSource = $source;
                $stationSource['source_notes'] .= "\nCoordinate source: ".$station['coordinates_source'].'; source coordinates_verified: '.($station['coordinates_verified'] ? 'true' : 'false').
                    '; source coordinates_verified_on: '.($station['coordinates_verified_on'] ?? 'not provided').
                    '; checked against: '.($station['coordinates_verified_against'] ?? 'not provided').'. These are source claims only.';
                $records['transport_stops'][] = ['id' => $stationId, 'name' => $station['name'], 'type' => 'train_station',
                    'latitude' => (float) $station['lat'], 'longitude' => (float) $station['lng'], 'address' => null] + $stationSource;
                $records['route_stops'][] = ['route_id' => $routeId, 'stop_id' => $stationId, 'position' => $position];
            }
            if (isset($data['fares']['station_order']) && $data['fares']['station_order'] !== array_column($stations, 'name')) {
                throw new UnexpectedValueException($id.': fare station_order references do not match canonical station names.');
            }
            $documents[$id] = $data;
        }
        foreach ($documents as $data) {
            foreach ($data['stations'] as $station) {
                foreach ($station['interchanges'] as $link) {
                    if (($stationIds[$link['station_id']] ?? null) !== $link['line_id']) {
                        throw new UnexpectedValueException('Interchange references an unknown station or mismatched line.');
                    }
                }
            }
        }

        return $records;
    }

    private function validateLine(array $data): void
    {
        Validator::make($data, [
            'schema_version' => ['required', 'integer', 'in:1'],
            'line' => ['required', 'array:id,code,name,operator,status,color'],
            'line.id' => ['required', 'string'],
            'line.code' => ['required', 'string'],
            'line.name' => ['required', 'string', 'max:255'],
            'line.operator' => ['required', 'string', 'max:255'],
            'line.status' => ['required', 'string'],
            'line.color' => ['required', 'string', 'regex:/^#[a-fA-F0-9]{6}$/'],
            'provenance.generated_on' => ['required', 'date_format:Y-m-d'],
            'provenance.verified_on' => ['required', 'date_format:Y-m-d'],
            'provenance.fares_effective_from' => ['required', 'date_format:Y-m-d'],
            'provenance.source_url' => ['required', 'url:https'],
            'provenance.source_note' => ['required', 'string'],
            'provenance.verified_note' => ['required', 'string'],
            'provenance.confidence' => ['required', 'string'],
            'stations' => ['required', 'array', 'min:2'],
            'stations.*' => ['required', 'array:id,slug,ordinal,name,full_name,former_names,lat,lng,coordinates_source,coordinates_verified,interchanges,coordinates_verified_on,coordinates_verified_against,coordinates_verified_delta_m,coordinates_note,opened_on'],
            'stations.*.id' => ['required', 'string', 'max:64'],
            'stations.*.name' => ['required', 'string', 'max:255', 'regex:/\S/'],
            'stations.*.slug' => ['required', 'string'],
            'stations.*.full_name' => ['required', 'string'],
            'stations.*.former_names' => ['present', 'array'],
            'stations.*.former_names.*' => ['required', 'string'],
            'stations.*.ordinal' => ['required', 'integer', 'min:1'],
            'stations.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'stations.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'stations.*.coordinates_source' => ['required', 'string'],
            'stations.*.coordinates_verified' => ['required', 'boolean'],
            'stations.*.coordinates_verified_on' => ['sometimes', 'date_format:Y-m-d'],
            'stations.*.coordinates_verified_against' => ['sometimes', 'string'],
            'stations.*.coordinates_verified_delta_m' => ['sometimes', 'numeric', 'min:0'],
            'stations.*.coordinates_note' => ['sometimes', 'string'],
            'stations.*.opened_on' => ['sometimes', 'date_format:Y-m-d'],
            'stations.*.interchanges' => ['present', 'array'],
            'stations.*.interchanges.*.station_id' => ['required', 'string'],
            'stations.*.interchanges.*.line_id' => ['required', 'in:lrt1,lrt2,mrt3'],
            'stations.*.interchanges.*.walk_minutes' => ['required', 'integer', 'min:0'],
            'stations.*.interchanges.*.walk_source_url' => ['required', 'url:https'],
            'stations.*.interchanges.*.walk_note' => ['required', 'string'],
            'fares' => ['required', 'array'],
            'products' => ['required', 'array'],
            'modifiers' => ['present', 'array'],
            'validation' => ['required', 'array'],
        ])->validate();
        foreach ($data['stations'] as $station) {
            if (! is_int($station['ordinal']) || ! is_bool($station['coordinates_verified']) ||
                (! is_int($station['lat']) && ! is_float($station['lat'])) || (! is_int($station['lng']) && ! is_float($station['lng'])) ||
                ! is_finite((float) $station['lat']) || ! is_finite((float) $station['lng'])) {
                throw new UnexpectedValueException('Station ordinals, coordinates and verification flags require native JSON number/boolean types.');
            }
        }
    }

    private function read(string $path): string
    {
        if (! is_file($path) || ! is_readable($path) || filesize($path) > 1024 * 1024) {
            throw new UnexpectedValueException('Missing, unreadable or oversized pinned snapshot.');
        }

        $bytes = file_get_contents($path);
        if ($bytes === false) {
            throw new UnexpectedValueException('Unable to read pinned snapshot.');
        }

        return $bytes;
    }
}
