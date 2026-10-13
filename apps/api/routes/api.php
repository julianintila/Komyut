<?php

declare(strict_types=1);

use App\Http\Controllers\TransportController;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

Route::get('/health', function (): JsonResponse {
    return response()->json([
        'service' => 'komyut-api',
        'status' => 'ok',
    ]);
})->name('api.health');

Route::get('/stops', [TransportController::class, 'stops'])->name('api.stops');
Route::get('/routes', [TransportController::class, 'routes'])->name('api.routes');
