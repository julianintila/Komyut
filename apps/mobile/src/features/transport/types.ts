export type StopType =
  | 'bus_stop'
  | 'jeepney_stop'
  | 'train_station'
  | 'transport_terminal';

export type VehicleType = 'bus' | 'jeepney' | 'train';

export type GeographicCoordinates = {
  latitude: number;
  longitude: number;
};

export type TransportDataSource = {
  sourceName: string;
  sourceUrl?: string;
  /** Calendar date in ISO YYYY-MM-DD format; omit when not verified. */
  verifiedOn?: string;
  notes?: string;
};

export type TransportStop = {
  id: string;
  name: string;
  type: StopType;
  location?: GeographicCoordinates;
  address?: string;
  source?: TransportDataSource;
};

export type TransportOperator = {
  id: string;
  name: string;
  vehicleTypes?: readonly VehicleType[];
  source?: TransportDataSource;
};

export type TransportRoute = {
  id: string;
  name: string;
  operatorId: string;
  vehicleType: VehicleType;
  /** Stop IDs in travel order for this route's direction. */
  stopIds: readonly string[];
  source?: TransportDataSource;
};
