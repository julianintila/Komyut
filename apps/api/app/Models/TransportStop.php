<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TransportStop extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'name', 'type', 'latitude', 'longitude', 'address', 'source_name', 'source_url', 'verified_on', 'source_notes'];

    protected function casts(): array
    {
        return ['latitude' => 'float', 'longitude' => 'float', 'verified_on' => 'date:Y-m-d'];
    }

    public function routeStops(): HasMany
    {
        return $this->hasMany(RouteStop::class, 'stop_id');
    }
}
