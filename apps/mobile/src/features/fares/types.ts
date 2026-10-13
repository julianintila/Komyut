import type { TransportDataSource, VehicleType } from '../transport/types';

export type FareProvenance =
  | {
    reliability: 'verified';
    source: TransportDataSource & { verifiedOn: string };
  }
  | {
    reliability: 'estimated' | 'unverified';
    source?: TransportDataSource;
  };

export type FixedFare = {
  type: 'fixed';
  amountCentavos: number;
};

export type DistanceBasedFare = {
  type: 'distance_based';
  baseFareCentavos: number;
  includedDistanceKm: number;
  minimumFareCentavos?: number;
  increment: {
    distanceKm: number;
    amountCentavos: number;
    rounding: 'up' | 'down' | 'nearest';
  };
};

export type StationPairFare = {
  originStopId: string;
  destinationStopId: string;
  amountCentavos: number;
};

export type StationPairFareStructure = {
  type: 'station_pair';
  fares: readonly StationPairFare[];
};

export type UnconfiguredFare = {
  type: 'unconfigured';
};

export type FareStructure =
  | FixedFare
  | DistanceBasedFare
  | StationPairFareStructure
  | UnconfiguredFare;

export type FareRule = {
  id: string;
  name: string;
  vehicleType: VehicleType;
  operatorId?: string;
  currency: 'PHP';
  structure: FareStructure;
  provenance: FareProvenance;
  /** ISO YYYY-MM-DD, inclusive when supplied. */
  effectiveFrom?: string;
  /** ISO YYYY-MM-DD, inclusive when supplied. */
  effectiveUntil?: string;
};
