<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TransportRoute extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'name', 'operator_id', 'vehicle_type', 'source_name', 'source_url', 'verified_on', 'source_notes'];

    protected function casts(): array
    {
        return ['verified_on' => 'date:Y-m-d'];
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(TransportOperator::class, 'operator_id');
    }

    public function routeStops(): HasMany
    {
        return $this->hasMany(RouteStop::class, 'route_id')->orderBy('position');
    }

    public function stops(): BelongsToMany
    {
        return $this->belongsToMany(TransportStop::class, 'route_stops', 'route_id', 'stop_id')
            ->withPivot('position')->orderByPivot('position');
    }
}
