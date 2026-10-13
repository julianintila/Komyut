import type {
  GeographicCoordinates,
  StopType,
  TransportDataSource,
  TransportOperator,
  TransportRoute,
  TransportStop,
  VehicleType,
} from '../src/features/transport';

// Compile-only contracts checked by tsc --noEmit; never execute this file.
declare function expectType<T>(value: T): void;
declare const stop: TransportStop;
declare const operator: TransportOperator;
declare const route: TransportRoute;
declare const source: TransportDataSource;
declare const coordinates: GeographicCoordinates;

expectType<StopType>('bus_stop');
expectType<StopType>('jeepney_stop');
expectType<StopType>('train_station');
expectType<StopType>('transport_terminal');
// @ts-expect-error Unsupported stop types must be rejected.
expectType<StopType>('airport');

expectType<VehicleType>('bus');
expectType<VehicleType>('jeepney');
expectType<VehicleType>('train');
// @ts-expect-error Private cars are not a supported vehicle type.
expectType<VehicleType>('car');

expectType<number>(coordinates.latitude);
expectType<number>(coordinates.longitude);
// @ts-expect-error Both named coordinate fields are required.
expectType<GeographicCoordinates>({ latitude: 0 });
// @ts-expect-error Coordinates must be numeric.
expectType<GeographicCoordinates>({ latitude: '0', longitude: 0 });

expectType<string>(stop.id);
expectType<string>(stop.name);
expectType<StopType>(stop.type);
expectType<string>(operator.id);
expectType<string>(operator.name);
expectType<readonly VehicleType[] | undefined>(operator.vehicleTypes);
expectType<string>(route.id);
expectType<string>(route.name);
expectType<string>(route.operatorId);
expectType<VehicleType>(route.vehicleType);
expectType<readonly string[]>(route.stopIds);
// @ts-expect-error Operator references must use string IDs.
expectType<TransportRoute['operatorId']>(1);
// @ts-expect-error Stop references must use string IDs.
expectType<TransportRoute['stopIds']>([1]);
// @ts-expect-error Ordered stop references cannot be mutated in place.
route.stopIds.push('test-stop-id');

expectType<TransportStop['location']>(undefined);
expectType<TransportStop['address']>(undefined);
expectType<TransportOperator['vehicleTypes']>(undefined);
expectType<TransportStop['source']>(undefined);
expectType<TransportOperator['source']>(undefined);
expectType<TransportRoute['source']>(undefined);
expectType<string>(source.sourceName);
expectType<string | undefined>(source.sourceUrl);
expectType<string | undefined>(source.verifiedOn);
expectType<string | undefined>(source.notes);
// @ts-expect-error When metadata is supplied, a source name is required.
expectType<TransportDataSource>({});
