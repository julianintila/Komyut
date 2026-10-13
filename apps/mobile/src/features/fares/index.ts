export type {
  DistanceBasedFare,
  FareProvenance,
  FareRule,
  FareStructure,
  FixedFare,
  StationPairFare,
  StationPairFareStructure,
  UnconfiguredFare,
} from './types';

export type {
  DiscountOutcome,
  DiscountPolicy,
  DiscountRequest,
  FareCalculationResult,
  FareJourney,
} from './calculationTypes';
export { calculateFare } from './calculateFare';
