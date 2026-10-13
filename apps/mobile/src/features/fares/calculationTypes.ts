import type { VehicleType } from '../transport/types';
import type { DistanceBasedFare, FareProvenance } from './types';

export type FareJourney = {
  vehicleType: VehicleType;
  operatorId?: string;
  distanceKm?: number;
  originStopId?: string;
  destinationStopId?: string;
  /** ISO YYYY-MM-DD; required when a rule has effective-date limits. */
  date?: string;
};

export type DiscountPolicy = {
  id: string;
  name: string;
  /** Integer rate out of 10,000; no rate is built into the engine. */
  rateBasisPoints: number;
  rounding: DistanceBasedFare['increment']['rounding'];
  conditions: {
    vehicleTypes: readonly VehicleType[];
    operatorIds?: readonly string[];
  };
  provenance: FareProvenance;
};

export type DiscountRequest = {
  policy?: DiscountPolicy;
  eligible?: boolean;
};

export type DiscountOutcome =
  | { status: 'not_requested' }
  | { status: 'not_eligible' }
  | {
    status: 'unavailable';
    reason: 'missing_policy' | 'unverified_policy' | 'eligibility_unknown' | 'conditions_not_met';
  };

type CalculatedFare = {
  currency: 'PHP';
  amountCentavos: number;
  regularFareCentavos: number;
  provenance: FareProvenance;
};

export type FareCalculationResult =
  | (CalculatedFare & { status: 'regular'; discount: DiscountOutcome })
  | (CalculatedFare & {
    status: 'discounted';
    discountCentavos: number;
    discountPolicyId: string;
    discountProvenance: FareProvenance;
  })
  | { status: 'unknown'; reason: 'unconfigured' | 'station_pair_missing' | 'not_applicable' }
  | { status: 'invalid_journey'; message: string }
  | { status: 'invalid_configuration'; message: string };
