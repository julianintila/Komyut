import type { TransportDataSource, TransportOperator, TransportRoute, TransportStop, VehicleType } from '../transport/types';

export type DirectRouteResult = {
  routeId: string;
  routeName: string;
  vehicleType: VehicleType;
  operator: TransportOperator;
  origin: TransportStop;
  destination: TransportStop;
  stops: readonly TransportStop[];
  source?: TransportDataSource;
};

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueRecords<T extends { id: string; name: string }>(records: readonly T[]): Map<string, T> {
  const indexed = new Map<string, T>();
  const seen = new Set<string>();
  for (const item of records) {
    if (!item || !text(item.id)) continue;
    if (seen.has(item.id)) {
      indexed.delete(item.id);
      continue;
    }
    seen.add(item.id);
    if (text(item.name)) indexed.set(item.id, item);
  }
  return indexed;
}

export function findDirectRoutes(
  originStopId: string,
  destinationStopId: string,
  routes: readonly TransportRoute[],
  stops: readonly TransportStop[],
  operators: readonly TransportOperator[],
): DirectRouteResult[] {
  if (!text(originStopId) || !text(destinationStopId) || originStopId === destinationStopId) return [];
  const stopIndex = uniqueRecords(stops);
  const operatorIndex = uniqueRecords(operators);
  if (!stopIndex.has(originStopId) || !stopIndex.has(destinationStopId)) return [];

  // Identical repeated records collapse; conflicting records sharing an ID are excluded.
  const routeIndex = new Map<string, TransportRoute | null>();
  for (const route of routes) {
    if (!route || !text(route.id)) continue;
    const previous = routeIndex.get(route.id);
    if (previous === null) continue;
    routeIndex.set(route.id, previous && JSON.stringify(previous) !== JSON.stringify(route) ? null : route);
  }

  const results: DirectRouteResult[] = [];
  for (const route of routeIndex.values()) {
    if (!route || !text(route.name) || !['bus', 'jeepney', 'train'].includes(route.vehicleType)
      || !Array.isArray(route.stopIds) || route.stopIds.length < 2
      || new Set(route.stopIds).size !== route.stopIds.length) continue;
    const operator = operatorIndex.get(route.operatorId);
    if (!operator || (operator.vehicleTypes !== undefined
      && (!Array.isArray(operator.vehicleTypes) || !operator.vehicleTypes.includes(route.vehicleType)))) continue;
    const orderedStops: TransportStop[] = [];
    for (const id of route.stopIds) {
      const stop = stopIndex.get(id);
      if (!stop || !['bus_stop', 'jeepney_stop', 'train_station', 'transport_terminal'].includes(stop.type)) break;
      orderedStops.push(stop);
    }
    if (orderedStops.length !== route.stopIds.length) continue;
    const originIndex = route.stopIds.indexOf(originStopId);
    const destinationIndex = route.stopIds.indexOf(destinationStopId);
    if (originIndex < 0 || destinationIndex <= originIndex) continue;
    const journeyStops = orderedStops.slice(originIndex, destinationIndex + 1);
    results.push({
      routeId: route.id,
      routeName: route.name,
      vehicleType: route.vehicleType,
      operator,
      origin: journeyStops[0],
      destination: journeyStops[journeyStops.length - 1],
      stops: journeyStops,
      source: route.source,
    });
  }
  return results;
}
