import type { StopType, TransportStop } from './types';

export function searchStops(
  query: string,
  stops: readonly TransportStop[],
  stopType?: StopType,
): TransportStop[] {
  const normalizedQuery = query.trim().toLowerCase();

  return stops.filter((stop) => {
    if (stopType && stop.type !== stopType) return false;

    return normalizedQuery.length === 0
      || stop.name.toLowerCase().includes(normalizedQuery)
      || (stop.address?.toLowerCase().includes(normalizedQuery) ?? false);
  });
}
