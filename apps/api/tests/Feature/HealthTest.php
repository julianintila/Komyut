<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_returns_only_the_documented_json_without_database_access(): void
    {
        DB::shouldReceive('connection')->never();

        $this->get('/api/health')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/json')
            ->assertExactJson([
                'service' => 'komyut-api',
                'status' => 'ok',
            ]);
    }

    public function test_health_does_not_accept_post_requests(): void
    {
        $this->postJson('/api/health')
            ->assertStatus(405)
            ->assertJsonMissingPath('exception')
            ->assertJsonMissingPath('trace')
            ->assertJsonMissingPath('file');
    }

    public function test_unknown_api_routes_return_json_without_production_debug_details(): void
    {
        config(['app.env' => 'production', 'app.debug' => false]);

        $this->get('/api/not-a-route')
            ->assertNotFound()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonMissingPath('exception')
            ->assertJsonMissingPath('trace')
            ->assertJsonMissingPath('file');
    }

    public function test_production_api_errors_do_not_expose_internal_messages_or_traces(): void
    {
        config(['app.env' => 'production', 'app.debug' => false]);
        Route::middleware('api')->get('/api/test-failure', function (): never {
            throw new RuntimeException('Sensitive test-only diagnostic');
        });

        $this->get('/api/test-failure')
            ->assertStatus(500)
            ->assertHeader('Content-Type', 'application/json')
            ->assertExactJson(['message' => 'Server Error']);
    }
}
