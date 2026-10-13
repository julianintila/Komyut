import type {
  DistanceBasedFare,
  FareProvenance,
  FareRule,
  FareStructure,
  FixedFare,
  StationPairFare,
  StationPairFareStructure,
  UnconfiguredFare,
} from '../src/features/fares';
import type { TransportDataSource } from '../src/features/transport';

// Compile-only contracts, not official fare examples; run tsc --noEmit, not Node.
declare function expectType<T>(value: T): void;
declare const amountCentavos: number;
declare const distanceKm: number;
declare const stationPair: StationPairFare;
declare const rule: FareRule;
declare const source: TransportDataSource;
declare const verifiedSource: TransportDataSource & { verifiedOn: string };

expectType<FixedFare>({ type: 'fixed', amountCentavos });
// @ts-expect-error Fixed fares require an amount.
expectType<FixedFare>({ type: 'fixed' });
// @ts-expect-error Amounts must be numeric.
expectType<FixedFare>({ type: 'fixed', amountCentavos: 'unknown' });

expectType<DistanceBasedFare>({
  type: 'distance_based',
  baseFareCentavos: amountCentavos,
  includedDistanceKm: distanceKm,
  minimumFareCentavos: amountCentavos,
  increment: { distanceKm, amountCentavos, rounding: 'up' },
});
// @ts-expect-error Distance fares require a base, included distance, and increment.
expectType<DistanceBasedFare>({ type: 'distance_based', baseFareCentavos: amountCentavos });
// @ts-expect-error An increment needs an explicit rounding convention.
expectType<DistanceBasedFare['increment']>({ distanceKm, amountCentavos });
// @ts-expect-error Unsupported rounding values are rejected.
expectType<DistanceBasedFare['increment']['rounding']>('automatic');

expectType<StationPairFareStructure>({ type: 'station_pair', fares: [stationPair] });
expectType<string>(stationPair.originStopId);
expectType<string>(stationPair.destinationStopId);
expectType<number>(stationPair.amountCentavos);
// @ts-expect-error Station-pair structures require a fare table.
expectType<StationPairFareStructure>({ type: 'station_pair' });
// @ts-expect-error Both station references and an amount are required.
expectType<StationPairFare>({ originStopId: 'test-station' });

expectType<UnconfiguredFare>({ type: 'unconfigured' });
// @ts-expect-error An unconfigured structure does not define a price.
expectType<UnconfiguredFare>({ type: 'unconfigured', amountCentavos });
// @ts-expect-error Other fare structures are not part of this contract.
expectType<FareStructure>({ type: 'zone' });

expectType<FareProvenance>({ reliability: 'verified', source: verifiedSource });
expectType<FareProvenance>({ reliability: 'estimated', source });
expectType<FareProvenance>({ reliability: 'unverified' });
// @ts-expect-error A verified rule needs provenance.
expectType<FareProvenance>({ reliability: 'verified' });
// @ts-expect-error Verified provenance requires a verification date.
expectType<FareProvenance>({ reliability: 'verified', source });
// @ts-expect-error Reliability must use a supported value.
expectType<FareProvenance>({ reliability: 'official' });

expectType<FareRule>({
  id: 'test-unconfigured-rule',
  name: 'Compile-only unconfigured rule',
  vehicleType: 'bus',
  currency: 'PHP',
  structure: { type: 'unconfigured' },
  provenance: { reliability: 'unverified' },
});
// @ts-expect-error Rule identity, applicability, currency, and provenance are required.
expectType<FareRule>({ structure: { type: 'unconfigured' } });
expectType<FareRule['currency']>('PHP');
// @ts-expect-error No other currency is configured in this contract.
expectType<FareRule['currency']>('USD');
expectType<string | undefined>(rule.operatorId);
expectType<string | undefined>(rule.effectiveFrom);
expectType<string | undefined>(rule.effectiveUntil);

function checkNarrowing(structure: FareStructure): void {
  switch (structure.type) {
    case 'fixed':
      expectType<number>(structure.amountCentavos);
      break;
    case 'distance_based':
      expectType<number>(structure.increment.distanceKm);
      break;
    case 'station_pair':
      expectType<readonly StationPairFare[]>(structure.fares);
      // @ts-expect-error Station-pair tables cannot be mutated in place.
      structure.fares.push(stationPair);
      break;
    case 'unconfigured':
      // @ts-expect-error No amount is available until a fare is configured.
      structure.amountCentavos;
      break;
    default:
      expectType<never>(structure);
  }
}
