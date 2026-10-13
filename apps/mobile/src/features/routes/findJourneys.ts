import { calculateFare } from '../fares/calculateFare';
import type { DiscountRequest, FareCalculationResult } from '../fares/calculationTypes';
import type { FareRule } from '../fares/types';
import type { TransportOperator, TransportRoute, TransportStop } from '../transport/types';
import { findDirectRoutes } from './findDirectRoutes';
import type { DirectRouteResult } from './findDirectRoutes';

export type SegmentFareInput = {
  routeId: string;
  originStopId: string;
  destinationStopId: string;
  rule: FareRule;
  distanceKm?: number;
  date?: string;
  discount?: DiscountRequest;
};

export type SegmentFareEstimate =
  | { status: 'unknown'; reason: 'missing_rule' | 'ambiguous_rule' }
  | { status: 'evaluated'; ruleId?: string; result: FareCalculationResult };

export type JourneySegment = DirectRouteResult & { fare: SegmentFareEstimate };

export type JourneyFareEstimate =
  | { status: 'complete'; currency: 'PHP'; totalCentavos: number; reliability: 'verified' | 'estimated' | 'unverified' }
  | { status: 'incomplete'; knownSegmentCount: number; segmentCount: number }
  | { status: 'unknown'; reason: 'no_calculated_segments' | 'total_overflow' };

export type JourneyResult = {
  origin: TransportStop;
  destination: TransportStop;
  segments: readonly JourneySegment[];
  transferStops: readonly TransportStop[];
  transferCount: number;
  fareEstimate: JourneyFareEstimate;
};

export type JourneyPlannerOptions = {
  /** Default 3; supported range 1 through 6 segments. */
  maxSegments?: number;
  /** Explicit assignments to exact route/boarding/alighting triples; no inferred rates or distances. */
  fareInputs?: readonly SegmentFareInput[];
};

function segmentFare(segment: DirectRouteResult, inputs: readonly SegmentFareInput[]): SegmentFareEstimate {
  const matches = inputs.filter((input) => input.routeId === segment.routeId
    && input.originStopId === segment.origin.id && input.destinationStopId === segment.destination.id);
  if (matches.length !== 1) return { status: 'unknown', reason: matches.length ? 'ambiguous_rule' : 'missing_rule' };
  const input = matches[0];
  return {
    status: 'evaluated',
    ruleId: typeof input.rule?.id === 'string' ? input.rule.id : undefined,
    result: calculateFare(input.rule, {
      vehicleType: segment.vehicleType,
      operatorId: segment.operator.id,
      originStopId: segment.origin.id,
      destinationStopId: segment.destination.id,
      distanceKm: input.distanceKm,
      date: input.date,
    }, input.discount),
  };
}

function totalFare(segments: readonly JourneySegment[]): JourneyFareEstimate {
  let sum = 0n;
  let known = 0;
  let reliability: 'verified' | 'estimated' | 'unverified' = 'verified';
  for (const segment of segments) {
    if (segment.fare.status !== 'evaluated') continue;
    const fare = segment.fare.result;
    if (fare.status !== 'regular' && fare.status !== 'discounted') continue;
    known++;
    sum += BigInt(fare.amountCentavos);
    const sources = [fare.provenance, ...(fare.status === 'discounted' ? [fare.discountProvenance] : [])];
    for (const source of sources) {
      if (source.reliability === 'unverified') reliability = 'unverified';
      else if (source.reliability === 'estimated' && reliability === 'verified') reliability = 'estimated';
    }
  }
  if (known === 0) return { status: 'unknown', reason: 'no_calculated_segments' };
  if (known !== segments.length) return { status: 'incomplete', knownSegmentCount: known, segmentCount: segments.length };
  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) return { status: 'unknown', reason: 'total_overflow' };
  return { status: 'complete', currency: 'PHP', totalCentavos: Number(sum), reliability };
}

export function findJourneys(
  originStopId: string,
  destinationStopId: string,
  routes: readonly TransportRoute[],
  stops: readonly TransportStop[],
  operators: readonly TransportOperator[],
  options: JourneyPlannerOptions = {},
): JourneyResult[] {
  const maxSegments = options.maxSegments === undefined ? 3 : options.maxSegments;
  if (!Number.isInteger(maxSegments) || maxSegments < 1 || maxSegments > 6) {
    throw new RangeError('maxSegments must be an integer from 1 through 6.');
  }
  if (originStopId === destinationStopId) return [];
  const stopIds = [...new Set(stops.filter((stop) => stop && typeof stop.id === 'string' && stop.id.trim()).map((stop) => stop.id))];
  if (!stopIds.includes(originStopId) || !stopIds.includes(destinationStopId)) return [];

  // Build directed segments through the existing finder so all Brick 10 integrity rules apply.
  const outgoing = new Map<string, DirectRouteResult[]>();
  for (const from of stopIds) {
    outgoing.set(from, stopIds.flatMap((to) => from === to ? [] : findDirectRoutes(from, to, routes, stops, operators)));
  }
  const paths: DirectRouteResult[][] = [];
  const seen = new Set<string>();
  function visit(current: string, path: readonly DirectRouteResult[], visitedStops: ReadonlySet<string>): void {
    if (path.length >= maxSegments) return;
    for (const segment of outgoing.get(current) ?? []) {
      if (path.some((previous) => previous.routeId === segment.routeId)) continue;
      const newStops = segment.stops.slice(1);
      if (newStops.some((stop) => visitedStops.has(stop.id))) continue;
      if (segment.destination.id !== destinationStopId && newStops.some((stop) => stop.id === destinationStopId)) continue;
      const next = [...path, segment];
      if (segment.destination.id === destinationStopId) {
        const key = JSON.stringify(next.map((leg) => [leg.routeId, leg.origin.id, leg.destination.id]));
        if (!seen.has(key)) {
          seen.add(key);
          paths.push(next);
        }
      } else {
        visit(segment.destination.id, next, new Set([...visitedStops, ...newStops.map((stop) => stop.id)]));
      }
    }
  }
  visit(originStopId, [], new Set([originStopId]));
  return paths.sort((left, right) => left.length - right.length).map((path) => {
    const segments = path.map((segment) => ({ ...segment, fare: segmentFare(segment, options.fareInputs ?? []) }));
    return {
      origin: segments[0].origin,
      destination: segments[segments.length - 1].destination,
      segments,
      transferStops: segments.slice(1).map((segment) => segment.origin),
      transferCount: segments.length - 1,
      fareEstimate: totalFare(segments),
    };
  });
}
