import type { TransportOperator } from '../types';

import { sampleSource } from './sampleSource';

export const sampleOperators = [
  {
    id: 'sample-operator-bus',
    name: 'Sample Bus Cooperative',
    vehicleTypes: ['bus'],
    source: sampleSource,
  },
  {
    id: 'sample-operator-jeepney',
    name: 'Sample Jeepney Cooperative',
    vehicleTypes: ['jeepney'],
    source: sampleSource,
  },
  {
    id: 'sample-operator-rail',
    name: 'Sample Rail Agency',
    vehicleTypes: ['train'],
    source: sampleSource,
  },
] as const satisfies readonly TransportOperator[];
