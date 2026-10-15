import type { RailStation, RailTicket } from '../types';

export type RailSelection = {
  originId: string | null;
  destinationId: string | null;
  selecting: 'origin' | 'destination';
  ticket: RailTicket;
  error: string | null;
};
export const initialRailSelection: RailSelection = { originId: null, destinationId: null, selecting: 'origin', ticket: 'beep', error: null };

export function selectRailStation(state: RailSelection, stationId: string, stations: readonly RailStation[]): RailSelection {
  const station = stations.find((item) => item.id === stationId);
  if (!station) return { ...state, error: 'This station is unavailable in the active rail dataset.' };
  if (state.selecting === 'origin') {
    const destination = stations.find((item) => item.id === state.destinationId);
    if (destination?.id === station.id) return { ...state, error: 'Choose different From and To stations.' };
    return { ...state, originId: station.id, destinationId: destination?.lineId === station.lineId ? destination.id : null, selecting: 'destination', error: null };
  }
  const origin = stations.find((item) => item.id === state.originId);
  if (!origin) return { ...state, error: 'Select a From station first.' };
  if (origin.id === station.id) return { ...state, error: 'Choose different From and To stations.' };
  if (origin.lineId !== station.lineId) return { ...state, error: 'Choose a To station on the same train line. Cross-line fares are unavailable.' };
  return { ...state, destinationId: station.id, error: null };
}

/** Philippine calendar day independent of the device's configured timezone. */
export function railEstimateDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
