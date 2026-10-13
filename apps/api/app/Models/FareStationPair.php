<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FareStationPair extends Model
{
    public $timestamps = false;

    protected $fillable = ['fare_rule_id', 'origin_stop_id', 'destination_stop_id', 'amount_centavos'];

    protected function casts(): array
    {
        return ['amount_centavos' => 'integer'];
    }

    public function fareRule(): BelongsTo
    {
        return $this->belongsTo(FareRule::class, 'fare_rule_id');
    }

    public function origin(): BelongsTo
    {
        return $this->belongsTo(TransportStop::class, 'origin_stop_id');
    }

    public function destination(): BelongsTo
    {
        return $this->belongsTo(TransportStop::class, 'destination_stop_id');
    }
}
