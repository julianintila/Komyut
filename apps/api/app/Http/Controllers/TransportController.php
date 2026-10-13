<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TransportRoute;
use App\Models\TransportStop;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use InvalidArgumentException;
use PDOException;
use Throwable;

class TransportController extends Controller
{
    private const SOURCE_FIELDS = ['source_name', 'source_url', 'verified_on', 'source_notes'];

    public function __construct(private TransportStop $stops, private TransportRoute $routes) {}

    public function stops(Request $request): JsonResponse
    {
        $parameters = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'type' => ['sometimes', Rule::in(['bus_stop', 'jeepney_stop', 'train_station', 'transport_terminal'])],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $limit = (int) ($parameters['limit'] ?? 50);
        try {
            $query = $this->stops->newQuery()->select(array_merge(['id', 'name', 'type', 'latitude', 'longitude', 'address'], self::SOURCE_FIELDS))->orderBy('id');
            $search = trim((string) ($parameters['q'] ?? ''));
            if ($search !== '') {
                $pattern = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search).'%';
                $query->where(fn (Builder $query) => $query->whereLike('name', $pattern)->orWhereLike('address', $pattern));
            }
            if (isset($parameters['type'])) {
                $query->where('type', $parameters['type']);
            }
            $records = $query->limit($limit + 1)->get();
            $data = $records->take($limit)->map(function (TransportStop $stop): array {
                $record = ['id' => $stop->id, 'name' => $stop->name, 'type' => $stop->type];
                if ($stop->latitude !== null && $stop->longitude !== null) {
                    $record['location'] = ['latitude' => $stop->latitude, 'longitude' => $stop->longitude];
                }
                if ($stop->address !== null) {
                    $record['address'] = $stop->address;
                }

                return $this->withSource($record, $stop);
            })->values()->all();

            return response()->json(['data' => $data, 'meta' => ['limit' => $limit, 'hasMore' => $records->count() > $limit]]);
        } catch (QueryException|PDOException|InvalidArgumentException $exception) {
            return $this->unavailable($exception);
        }
    }

    public function routes(Request $request): JsonResponse
    {
        $parameters = $request->validate(['limit' => ['sometimes', 'integer', 'min:1', 'max:100']]);
        $limit = (int) ($parameters['limit'] ?? 50);
        try {
            $records = $this->routes->newQuery()
                ->select(array_merge(['id', 'name', 'operator_id', 'vehicle_type'], self::SOURCE_FIELDS))
                ->with('routeStops:id,route_id,stop_id,position')->orderBy('id')->limit($limit + 1)->get();
            $data = $records->take($limit)->map(fn (TransportRoute $route): array => $this->withSource([
                'id' => $route->id, 'name' => $route->name, 'operatorId' => $route->operator_id,
                'vehicleType' => $route->vehicle_type, 'stopIds' => $route->routeStops->pluck('stop_id')->all(),
            ], $route))->values()->all();

            return response()->json(['data' => $data, 'meta' => ['limit' => $limit, 'hasMore' => $records->count() > $limit]]);
        } catch (QueryException|PDOException|InvalidArgumentException $exception) {
            return $this->unavailable($exception);
        }
    }

    private function withSource(array $record, Model $model): array
    {
        if ($model->source_name !== null) {
            $source = ['sourceName' => $model->source_name];
            foreach (['sourceUrl' => 'source_url', 'notes' => 'source_notes'] as $name => $column) {
                if ($model->$column !== null) {
                    $source[$name] = $model->$column;
                }
            }
            if ($model->verified_on !== null) {
                $source['verifiedOn'] = $model->verified_on->format('Y-m-d');
            }
            $record['source'] = $source;
        }

        return $record;
    }

    private function unavailable(Throwable $exception): JsonResponse
    {
        report($exception);

        return response()->json(['error' => ['code' => 'transport_unavailable', 'message' => 'Transport data is currently unavailable.']], 503);
    }
}
