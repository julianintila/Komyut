import type { TransportOperator, TransportStop } from '../transport/types';

export type RailLineId = 'lrt1' | 'lrt2' | 'mrt3';
export type RailTicket = 'beep' | 'single_journey';

export type RailProvenance = {
  datasetUrl: string;
  generatedOn: string;
  sourceVerifiedOn: string;
  faresEffectiveFrom: string;
  underlyingSourceUrl: string;
  sourceNote: string;
  verificationNote: string;
  confidenceClaim: string;
  independentlyVerified: false;
};

export type RailStation = TransportStop & {
  lineId: RailLineId;
  ordinal: number;
  fullName: string;
  formerNames: readonly string[];
  coordinatesSource: string;
  coordinatesVerifiedClaim: boolean;
  coordinatesSourceVerifiedOn?: string;
  coordinatesVerifiedAgainst?: string;
};

export type RailModifier = {
  id: string;
  label: string;
  percentage: number;
  requiresUserSelection: boolean;
  requirement?: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  appliesToLines: readonly RailLineId[];
  sourceUrl: string;
  lastConfirmed: string;
  notes: string;
  stackingNote: string;
  stacks: false;
  independentlyVerified: false;
};

export type RailFareStructure =
  | { type: 'matrix'; stationIds: readonly string[]; matrixCentavos: readonly (readonly number[])[] }
  | { type: 'station_bands'; bands: readonly { minSpan: number; fareCentavos: number }[] };

export type RailLine = {
  id: RailLineId;
  code: string;
  name: string;
  operator: TransportOperator;
  stations: readonly RailStation[];
  provenance: RailProvenance;
  fareStructure: RailFareStructure;
  modifiers: readonly RailModifier[];
};

export type RailBundle = {
  schemaVersion: 1;
  generatedOn: string;
  attribution: string;
  licenseUrl: string;
  lines: readonly RailLine[];
  stations: readonly RailStation[];
};

export type RailFareRequest = {
  originStationId: string;
  destinationStationId: string;
  ticket: RailTicket;
  /** Explicit Philippine calendar date, ISO YYYY-MM-DD; no implicit device clock. */
  date: string;
  /** Requests a source-recorded concession, not proof of eligibility. */
  claimedModifierIds?: readonly string[];
};

export type RailBaseFareResult =
  | { status: 'unavailable'; reason: 'invalid_request' | 'station_unknown' | 'same_station' | 'cross_line_not_supported' | 'before_effective_date' | 'fare_out_of_range' }
  | {
    status: 'source_base_estimate';
    currency: 'PHP';
    lineId: RailLineId;
    ticket: RailTicket;
    baseFareCentavos: number;
    currentlyPayableCentavos: null;
    provenance: RailProvenance;
    /** Default freshness window is 30 days; freshness is not verification. */
    sourceFreshness: 'recent_source_claim' | 'stale' | 'not_yet_verified_by_source';
    policyStatus: 'unavailable_unverified_source';
    applicableSourceModifiers: readonly {
      modifier: RailModifier;
      freshness: 'recent_source_claim' | 'stale' | 'not_yet_verified_by_source';
    }[];
  };
