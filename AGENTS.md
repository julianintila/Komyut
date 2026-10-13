# Development Rules

Build a Philippine Commuter Guide for public transportation fares, terminals,
stations, and step-by-step routes. Follow `docs/roadmap.md` as the authoritative
development roadmap.

- Implement one brick per task.
- Never implement future bricks without explicit approval.
- Keep code simple, readable, typed, and maintainable.
- Avoid unnecessary dependencies, abstractions, and infrastructure.
- Separate UI, business logic, API calls, and data models.
- Keep fare calculations independent of UI components.
- Never present invented transport data as verified information.
- Document data sources and fare verification dates.
- Inspect files before modifying them.
- Do not overwrite or delete unrelated files.
- Run relevant checks and report their actual results.
- Stop after each brick and wait for approval before continuing.

## Technology Direction

- Mobile: React Native + Expo + TypeScript in `apps/mobile/`.
- Public website: Next.js + TypeScript, initialized in Brick 16.
- Backend: Laravel, initialized in Brick 13.
- API development follows `apps/api/AGENTS.md`; setup is documented in
  `apps/api/README.md`. Do not run database migrations as part of API initialization.
- Database: PostgreSQL, schema created in Brick 14.

## Brick 1 Scope

Create project documentation and the standard Expo TypeScript application.
Preserve the standard template structure. Verify startup, TypeScript
configuration, and available checks. Document Windows setup instructions.
Do not initialize the website or backend, or build app screens, maps, fare
calculations, authentication, databases, or other application features.
