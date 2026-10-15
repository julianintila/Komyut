import { createExpoRailRepository } from '../persistence/expoRailRepository';
import type { RailRepository } from '../persistence/createRailRepository';

let repository: RailRepository | undefined;

/** Cache validation runs on first rail-mode mount in each app session, never on import. */
export function getRailRepository(): RailRepository {
  repository ??= createExpoRailRepository();
  return repository;
}
