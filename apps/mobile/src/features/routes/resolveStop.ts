import { searchStops } from '../transport/searchStops';
import type { TransportStop } from '../transport/types';

export type StopResolution =
  | { status: 'resolved'; stop: TransportStop }
  | { status: 'missing' | 'ambiguous' };

export function resolveStop(query: string, stops: readonly TransportStop[]): StopResolution {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return { status: 'missing' };
  const matches = searchStops(query, stops);
  const exact = matches.filter((stop) => stop.name.toLowerCase() === normalized);
  const candidates = exact.length > 0 ? exact : matches;
  if (candidates.length === 0) return { status: 'missing' };
  if (candidates.length !== 1) return { status: 'ambiguous' };
  return { status: 'resolved', stop: candidates[0] };
}
