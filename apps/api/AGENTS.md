# API Development Rules

Follow the root `AGENTS.md` and `docs/roadmap.md`. Implement only the approved
brick and stop afterward. Preserve the mobile application and do not copy its
fare or routing algorithms into the backend without an approved contract.

- Use Laravel 12 conventions and simple, explicitly typed PHP where appropriate.
- Register stateless API routes in `routes/api.php` through `bootstrap/app.php`.
- Health is a liveness check, not a database or transport-data readiness check.
- Keep health database-independent. No migrations, authentication, transport
  endpoints, frontend tooling, or mobile integration belong to Brick 13.
- Store secrets only in ignored environment configuration. `.env.example`
  contains empty secret placeholders. Never print keys or environment contents.
- Keep `APP_DEBUG=false` for production and shared environments.
- Use PHPUnit through `php artisan test`, and check style with
  `vendor/bin/pint --test` (on Windows: `php vendor/laravel/pint/builds/pint --test`).
- Run `composer validate --strict` and relevant mobile checks; report actual
  results and any missing tooling. Do not run migrations implicitly during setup.
- Brick 14 migrations target PostgreSQL only. Check `pdo_pgsql` first; never
  substitute SQLite/MySQL. Preserve existing `.env` and credentials.
- Never migrate production or reset an existing database. Live schema tests
  require explicit opt-in, a dedicated local test database, and isolated
  transactional schemas. Keep ordinary checks database-independent.
- Do not install Docker/Sail, Sanctum, or other infrastructure without approval.
