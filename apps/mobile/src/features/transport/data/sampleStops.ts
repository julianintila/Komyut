import type { TransportStop } from '../types';

import { sampleSource } from './sampleSource';

export const sampleStops = [
  {
    id: 'sample-stop-bayan-terminal',
    name: 'Sample Bayan Terminal',
    type: 'transport_terminal',
    source: sampleSource,
  },
  {
    id: 'sample-stop-palengke',
    name: 'Sample Palengke Bus Stop',
    type: 'bus_stop',
    source: sampleSource,
  },
  {
    id: 'sample-stop-plaza',
    name: 'Sample Plaza Jeepney Stop',
    type: 'jeepney_stop',
    source: sampleSource,
  },
  {
    id: 'sample-stop-silangan-station',
    name: 'Sample Silangan Station',
    type: 'train_station',
    source: sampleSource,
  },
  {
    id: 'sample-stop-kanluran-station',
    name: 'Sample Kanluran Station',
    type: 'train_station',
    source: sampleSource,
  },
] as const satisfies readonly TransportStop[];
