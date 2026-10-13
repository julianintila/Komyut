import type { GeographicCoordinates, TransportStop } from './types';

export function hasValidCoordinates(value: unknown): value is GeographicCoordinates {
  if (typeof value !== 'object' || value === null) return false;
  const { latitude, longitude } = value as Partial<GeographicCoordinates>;
  return typeof latitude === 'number' && Number.isFinite(latitude)
    && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude)
    && longitude >= -180 && longitude <= 180;
}

function uniqueStops(stops: readonly TransportStop[]): TransportStop[] {
  const records = new Map<string, TransportStop | null>();
  for (const stop of stops) {
    if (!stop.id.trim()) continue;
    const previous = records.get(stop.id);
    if (previous === null) continue;
    // Collapse identical records, but never choose between conflicting identities.
    records.set(stop.id, previous && JSON.stringify(previous) !== JSON.stringify(stop) ? null : previous ?? stop);
  }
  return [...records.values()].filter((stop): stop is TransportStop => stop !== null);
}

export function getMapStops(stops: readonly TransportStop[]): TransportStop[] {
  return uniqueStops(stops).filter((stop) => hasValidCoordinates(stop.location));
}

export function selectStopById(stops: readonly TransportStop[], id: string): TransportStop | undefined {
  return uniqueStops(stops).find((stop) => stop.id === id);
}

export function stopMapUrl(stop: TransportStop): string | undefined {
  if (!hasValidCoordinates(stop.location)) return undefined;
  const coordinates = encodeURIComponent(`${stop.location.latitude},${stop.location.longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${coordinates}`;
}

export function stopWalkingUrl(stop: TransportStop): string | undefined {
  if (!hasValidCoordinates(stop.location)) return undefined;
  const coordinates = encodeURIComponent(`${stop.location.latitude},${stop.location.longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${coordinates}&travelmode=walking`;
}
