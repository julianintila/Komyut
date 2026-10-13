import type { TransportStop } from '../src/features/transport';
import type { RailBaseFareResult, RailLineId, RailStation, RailTicket } from '../src/features/rail';

declare function expectType<T>(value: T): void;
declare const station: RailStation;
declare const result: Extract<RailBaseFareResult, { status: 'source_base_estimate' }>;

expectType<TransportStop>(station);
expectType<RailLineId>('lrt1');
expectType<RailTicket>('single_journey');
expectType<null>(result.currentlyPayableCentavos);
expectType<false>(result.provenance.independentlyVerified);
// @ts-expect-error Unsupported lines cannot enter the rail contract.
expectType<RailLineId>('pnr');
// @ts-expect-error Unsupported ticket products require a reviewed adapter.
expectType<RailTicket>('tourist_pass');
