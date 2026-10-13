import type { TransportRoute } from '../types';

import { sampleSource } from './sampleSource';

export const sampleRoutes = [
  {
    id: 'sample-route-bayan-palengke',
    name: 'Sample Bus: Bayan to Palengke',
    operatorId: 'sample-operator-bus',
    vehicleType: 'bus',
    stopIds: ['sample-stop-bayan-terminal', 'sample-stop-palengke'],
    source: sampleSource,
  },
  {
    id: 'sample-route-plaza-bayan',
    name: 'Sample Jeepney: Plaza to Bayan',
    operatorId: 'sample-operator-jeepney',
    vehicleType: 'jeepney',
    stopIds: ['sample-stop-plaza', 'sample-stop-bayan-terminal'],
    source: sampleSource,
  },
  {
    id: 'sample-route-silangan-kanluran',
    name: 'Sample Train: Silangan to Kanluran',
    operatorId: 'sample-operator-rail',
    vehicleType: 'train',
    stopIds: ['sample-stop-silangan-station', 'sample-stop-kanluran-station'],
    source: sampleSource,
  },
] as const satisfies readonly TransportRoute[];
