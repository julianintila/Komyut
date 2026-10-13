<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FareRule extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'name', 'operator_id', 'vehicle_type', 'currency', 'structure_type',
        'amount_centavos', 'base_fare_centavos', 'included_distance_km', 'minimum_fare_centavos',
        'increment_distance_km', 'increment_amount_centavos', 'increment_rounding',
        'reliability', 'source_name', 'source_url', 'verified_on', 'source_notes', 'effective_from', 'effective_until',
    ];

    protected function casts(): array
    {
        return [
            'amount_centavos' => 'integer', 'base_fare_centavos' => 'integer',
            'minimum_fare_centavos' => 'integer', 'increment_amount_centavos' => 'integer',
            'included_distance_km' => 'decimal:10', 'increment_distance_km' => 'decimal:10',
            'verified_on' => 'date:Y-m-d', 'effective_from' => 'date:Y-m-d', 'effective_until' => 'date:Y-m-d',
        ];
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(TransportOperator::class, 'operator_id');
    }

    public function stationPairs(): HasMany
    {
        return $this->hasMany(FareStationPair::class, 'fare_rule_id');
    }
}
