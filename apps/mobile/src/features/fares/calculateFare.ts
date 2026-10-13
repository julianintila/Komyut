import type { DiscountOutcome, DiscountRequest, FareCalculationResult, FareJourney } from './calculationTypes';
import type { DistanceBasedFare, FareRule } from './types';

const vehicleTypes = ['bus', 'jeepney', 'train'];
const roundingModes = ['up', 'down', 'nearest'];
const maxMoney = BigInt(Number.MAX_SAFE_INTEGER);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function money(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function distance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function provenance(value: unknown): boolean {
  if (!record(value) || typeof value.reliability !== 'string'
    || !['verified', 'estimated', 'unverified'].includes(value.reliability)) return false;
  if (value.source === undefined) return value.reliability !== 'verified';
  if (!record(value.source) || !text(value.source.sourceName)) return false;
  if (value.source.sourceUrl !== undefined && !text(value.source.sourceUrl)) return false;
  if (value.source.notes !== undefined && typeof value.source.notes !== 'string') return false;
  if (value.source.verifiedOn !== undefined && !date(value.source.verifiedOn)) return false;
  return value.reliability !== 'verified' || date(value.source.verifiedOn);
}

function validateRule(rule: FareRule): string | undefined {
  if (!record(rule) || !text(rule.id) || !text(rule.name) || rule.currency !== 'PHP'
    || !vehicleTypes.includes(rule.vehicleType) || !provenance(rule.provenance)) {
    return 'Rule identity, currency, transport mode, or provenance is invalid.';
  }
  if (rule.operatorId !== undefined && !text(rule.operatorId)) return 'Operator ID is invalid.';
  if ((rule.effectiveFrom !== undefined && !date(rule.effectiveFrom))
    || (rule.effectiveUntil !== undefined && !date(rule.effectiveUntil))
    || (rule.effectiveFrom && rule.effectiveUntil && rule.effectiveFrom > rule.effectiveUntil)) {
    return 'Rule effective dates are invalid or reversed.';
  }
  const structure = rule.structure;
  if (!record(structure)) return 'Fare structure is missing.';
  switch (structure.type) {
    case 'fixed':
      return money(structure.amountCentavos) ? undefined : 'Fixed amount must be nonnegative safe integer centavos.';
    case 'distance_based':
      if (!money(structure.baseFareCentavos) || !distance(structure.includedDistanceKm)
        || (structure.minimumFareCentavos !== undefined && !money(structure.minimumFareCentavos))
        || !record(structure.increment) || !distance(structure.increment.distanceKm)
        || structure.increment.distanceKm === 0 || !money(structure.increment.amountCentavos)
        || !roundingModes.includes(structure.increment.rounding)) {
        return 'Distance fare amounts, distances, or increment rounding are invalid.';
      }
      return undefined;
    case 'station_pair': {
      if (!Array.isArray(structure.fares) || structure.fares.length === 0) return 'Station fare table must not be empty.';
      const pairs = new Set<string>();
      for (const pair of structure.fares) {
        if (!record(pair) || !text(pair.originStopId) || !text(pair.destinationStopId) || !money(pair.amountCentavos)) {
          return 'Station fare entries require station IDs and valid centavos.';
        }
        const key = JSON.stringify([pair.originStopId, pair.destinationStopId]);
        if (pairs.has(key)) return 'Station fare table contains a duplicate directed pair.';
        pairs.add(key);
      }
      return undefined;
    }
    case 'unconfigured':
      return Object.keys(structure).length === 1 ? undefined : 'Unconfigured fares must not contain pricing fields.';
    default:
      return 'Fare structure is unsupported.';
  }
}

function validateDiscount(request: DiscountRequest): string | undefined {
  if (!record(request) || (request.eligible !== undefined && typeof request.eligible !== 'boolean')) {
    return 'Discount eligibility must be explicitly true, false, or omitted.';
  }
  const policy = request.policy;
  if (policy === undefined) return undefined;
  if (!record(policy) || !text(policy.id) || !text(policy.name) || !money(policy.rateBasisPoints)
    || policy.rateBasisPoints > 10000 || !roundingModes.includes(policy.rounding)
    || !provenance(policy.provenance) || !record(policy.conditions)
    || !Array.isArray(policy.conditions.vehicleTypes) || policy.conditions.vehicleTypes.length === 0
    || !policy.conditions.vehicleTypes.every((mode) => vehicleTypes.includes(mode))) {
    return 'Discount policy identity, rate, rounding, provenance, or conditions are invalid.';
  }
  const operators = policy.conditions.operatorIds;
  if (operators !== undefined && (!Array.isArray(operators) || operators.length === 0 || !operators.every(text))) {
    return 'Discount operator conditions must contain nonempty IDs.';
  }
  return undefined;
}

function roundRatio(numerator: bigint, denominator: bigint, mode: DistanceBasedFare['increment']['rounding']): bigint {
  const whole = numerator / denominator;
  const remainder = numerator % denominator;
  if (mode === 'up') return whole + (remainder > 0n ? 1n : 0n);
  if (mode === 'nearest') return whole + (remainder * 2n >= denominator ? 1n : 0n);
  return whole;
}

// Use exact fractions of each number's decimal representation, including scientific notation.
function decimalFraction(value: number): [bigint, bigint] {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const numerator = BigInt(whole + fraction);
  return scale >= 0
    ? [numerator, 10n ** BigInt(scale)]
    : [numerator * 10n ** BigInt(-scale), 1n];
}

function distanceFare(structure: DistanceBasedFare, journeyDistance: number): bigint {
  const [total, totalScale] = decimalFraction(journeyDistance);
  const [included, includedScale] = decimalFraction(structure.includedDistanceKm);
  const [increment, incrementScale] = decimalFraction(structure.increment.distanceKm);
  const excess = total * includedScale - included * totalScale;
  const increments = excess <= 0n ? 0n : roundRatio(
    excess * incrementScale,
    totalScale * includedScale * increment,
    structure.increment.rounding,
  );
  const fare = BigInt(structure.baseFareCentavos) + increments * BigInt(structure.increment.amountCentavos);
  const minimum = BigInt(structure.minimumFareCentavos ?? 0);
  return fare > minimum ? fare : minimum;
}

export function calculateFare(rule: FareRule, journey: FareJourney, discount?: DiscountRequest): FareCalculationResult {
  const configurationError = validateRule(rule) ?? (discount === undefined ? undefined : validateDiscount(discount));
  if (configurationError) return { status: 'invalid_configuration', message: configurationError };
  if (!record(journey) || !vehicleTypes.includes(journey.vehicleType)
    || (journey.operatorId !== undefined && !text(journey.operatorId))
    || (journey.distanceKm !== undefined && !distance(journey.distanceKm))
    || (journey.originStopId !== undefined && !text(journey.originStopId))
    || (journey.destinationStopId !== undefined && !text(journey.destinationStopId))
    || (journey.date !== undefined && !date(journey.date))) {
    return { status: 'invalid_journey', message: 'Journey transport mode, IDs, distance, or date is invalid.' };
  }
  if ((rule.effectiveFrom || rule.effectiveUntil) && !journey.date) {
    return { status: 'invalid_journey', message: 'A journey date is required for this rule.' };
  }
  if (rule.vehicleType !== journey.vehicleType
    || (rule.operatorId !== undefined && rule.operatorId !== journey.operatorId)
    || (journey.date !== undefined && (
      (rule.effectiveFrom !== undefined && journey.date < rule.effectiveFrom)
      || (rule.effectiveUntil !== undefined && journey.date > rule.effectiveUntil)
    ))) {
    return { status: 'unknown', reason: 'not_applicable' };
  }

  let amount: bigint;
  switch (rule.structure.type) {
    case 'fixed':
      amount = BigInt(rule.structure.amountCentavos);
      break;
    case 'distance_based':
      if (journey.distanceKm === undefined) return { status: 'invalid_journey', message: 'Distance is required for this rule.' };
      amount = distanceFare(rule.structure, journey.distanceKm);
      break;
    case 'station_pair': {
      if (!journey.originStopId || !journey.destinationStopId) {
        return { status: 'invalid_journey', message: 'Origin and destination station IDs are required.' };
      }
      const pair = rule.structure.fares.find((fare) =>
        fare.originStopId === journey.originStopId && fare.destinationStopId === journey.destinationStopId);
      if (!pair) return { status: 'unknown', reason: 'station_pair_missing' };
      amount = BigInt(pair.amountCentavos);
      break;
    }
    case 'unconfigured':
      return { status: 'unknown', reason: 'unconfigured' };
  }
  if (amount > maxMoney) return { status: 'invalid_configuration', message: 'Calculated fare exceeds safe integer centavos.' };
  const regularFareCentavos = Number(amount);
  const calculated = { currency: rule.currency, regularFareCentavos, provenance: rule.provenance };
  let outcome: DiscountOutcome;
  if (discount === undefined) outcome = { status: 'not_requested' };
  else if (discount.eligible === false) outcome = { status: 'not_eligible' };
  else if (discount.eligible !== true) outcome = { status: 'unavailable', reason: 'eligibility_unknown' };
  else if (!discount.policy) outcome = { status: 'unavailable', reason: 'missing_policy' };
  else if (discount.policy.provenance.reliability !== 'verified') outcome = { status: 'unavailable', reason: 'unverified_policy' };
  else if (!discount.policy.conditions.vehicleTypes.includes(journey.vehicleType)
    || (discount.policy.conditions.operatorIds && !discount.policy.conditions.operatorIds.includes(journey.operatorId ?? ''))) {
    outcome = { status: 'unavailable', reason: 'conditions_not_met' };
  } else {
    const policy = discount.policy;
    const payable = roundRatio(amount * BigInt(10000 - policy.rateBasisPoints), 10000n, policy.rounding);
    return {
      ...calculated,
      status: 'discounted',
      amountCentavos: Number(payable),
      discountCentavos: Number(amount - payable),
      discountPolicyId: policy.id,
      discountProvenance: policy.provenance,
    };
  }
  return { ...calculated, status: 'regular', amountCentavos: regularFareCentavos, discount: outcome };
}
