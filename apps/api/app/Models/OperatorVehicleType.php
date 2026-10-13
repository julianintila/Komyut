<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OperatorVehicleType extends Model
{
    public $timestamps = false;

    protected $fillable = ['operator_id', 'vehicle_type'];

    public function operator(): BelongsTo
    {
        return $this->belongsTo(TransportOperator::class, 'operator_id');
    }
}
