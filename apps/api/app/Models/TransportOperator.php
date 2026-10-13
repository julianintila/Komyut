<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TransportOperator extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'name', 'source_name', 'source_url', 'verified_on', 'source_notes'];

    protected function casts(): array
    {
        return ['verified_on' => 'date:Y-m-d'];
    }

    public function vehicleTypes(): HasMany
    {
        return $this->hasMany(OperatorVehicleType::class, 'operator_id');
    }

    public function routes(): HasMany
    {
        return $this->hasMany(TransportRoute::class, 'operator_id');
    }

    public function fareRules(): HasMany
    {
        return $this->hasMany(FareRule::class, 'operator_id');
    }
}
