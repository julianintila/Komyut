import type { TransportDataSource } from '../types';

export const sampleSource = {
  sourceName: 'Fictional development fixture',
  notes: 'All places, operators, and route connections in this dataset are fictional. Not verified; not for travel planning.',
} as const satisfies TransportDataSource;
