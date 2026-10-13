import type { RailBaseFareResult, RailBundle, RailFareRequest } from './types';
import { isRailDate } from './validateRailBundle';

const DAY_MS = 86_400_000;

function freshness(sourceDate: string, journeyDate: string, maxAgeDays: number): 'recent_source_claim' | 'stale' | 'not_yet_verified_by_source' {
  const age = (Date.parse(`${journeyDate}T00:00:00Z`) - Date.parse(`${sourceDate}T00:00:00Z`)) / DAY_MS;
  return age < 0 ? 'not_yet_verified_by_source' : age > maxAgeDays ? 'stale' : 'recent_source_claim';
}

/** Source-recorded ticket base only: no claim about current payable prices or eligibility. */
export function deriveRailBaseFare(bundle: RailBundle, request: RailFareRequest, maxSourceAgeDays = 30): RailBaseFareResult {
  if (!request || !isRailDate(request.date) || !['beep', 'single_journey'].includes(request.ticket)
    || typeof request.originStationId !== 'string' || typeof request.destinationStationId !== 'string'
    || !Number.isSafeInteger(maxSourceAgeDays) || maxSourceAgeDays < 0
    || (request.claimedModifierIds !== undefined && (!Array.isArray(request.claimedModifierIds) || !request.claimedModifierIds.every((id) => typeof id === 'string')))) {
    return { status: 'unavailable', reason: 'invalid_request' };
  }
  const origin = bundle.stations.find((station) => station.id === request.originStationId);
  const destination = bundle.stations.find((station) => station.id === request.destinationStationId);
  if (!origin || !destination) return { status: 'unavailable', reason: 'station_unknown' };
  if (origin.id === destination.id) return { status: 'unavailable', reason: 'same_station' };
  if (origin.lineId !== destination.lineId) return { status: 'unavailable', reason: 'cross_line_not_supported' };
  const line = bundle.lines.find((line) => line.id === origin.lineId)!;
  if (request.date < line.provenance.faresEffectiveFrom) return { status: 'unavailable', reason: 'before_effective_date' };
  if (request.claimedModifierIds?.some((id) => !line.modifiers.some((modifier) => modifier.id === id))) {
    return { status: 'unavailable', reason: 'invalid_request' };
  }
  const structure = line.fareStructure;
  let baseFareCentavos: number;
  if (structure.type === 'matrix') {
    const row = structure.stationIds.indexOf(origin.id);
    const column = structure.stationIds.indexOf(destination.id);
    baseFareCentavos = structure.matrixCentavos[row][column];
    if (request.ticket === 'single_journey') {
      const increment = 500;
      baseFareCentavos = Math.ceil(baseFareCentavos / increment) * increment;
    }
  } else {
    const span = Math.abs(origin.ordinal - destination.ordinal);
    baseFareCentavos = structure.bands[0].fareCentavos;
    for (const band of structure.bands) {
      if (band.minSpan <= span) baseFareCentavos = band.fareCentavos;
    }
  }
  if (!Number.isSafeInteger(baseFareCentavos) || baseFareCentavos < 0) return { status: 'unavailable', reason: 'fare_out_of_range' };
  const applicableSourceModifiers = line.modifiers.filter((modifier) =>
    modifier.appliesToLines.includes(line.id) && request.date >= modifier.effectiveFrom
    && (modifier.effectiveUntil === null || request.date <= modifier.effectiveUntil)
    && (!modifier.requiresUserSelection || request.claimedModifierIds?.includes(modifier.id)))
    .map((modifier) => ({ modifier, freshness: freshness(modifier.lastConfirmed, request.date, maxSourceAgeDays) }));

  return {
    status: 'source_base_estimate', currency: 'PHP', lineId: line.id, ticket: request.ticket,
    baseFareCentavos, currentlyPayableCentavos: null, provenance: line.provenance,
    sourceFreshness: freshness(line.provenance.sourceVerifiedOn, request.date, maxSourceAgeDays),
    policyStatus: 'unavailable_unverified_source', applicableSourceModifiers,
  };
}
