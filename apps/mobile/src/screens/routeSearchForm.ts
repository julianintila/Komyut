import { findJourneys } from '../features/routes/findJourneys';
import type { JourneyResult } from '../features/routes/findJourneys';
import { resolveStop } from '../features/routes/resolveStop';
import type { TransportOperator, TransportRoute, TransportStop } from '../features/transport/types';

export type RouteSearchFormState = {
  origin: string;
  destination: string;
  feedback: { kind: 'error' | 'results'; message: string } | null;
  journeys: readonly JourneyResult[];
};

export type RouteSearchFormAction =
  | { type: 'edit'; field: 'origin' | 'destination'; value: string }
  | { type: 'swap' }
  | {
    type: 'submit';
    dataset: {
      stops: readonly TransportStop[];
      operators: readonly TransportOperator[];
      routes: readonly TransportRoute[];
    };
  };

export const initialRouteSearchForm: RouteSearchFormState = {
  origin: '',
  destination: '',
  feedback: null,
  journeys: [],
};

function resolutionMessage(label: 'From' | 'To', status: 'missing' | 'ambiguous'): string {
  return status === 'ambiguous'
    ? `${label} matches several sample stops. Enter a more specific stop name.`
    : `No sample stop matches ${label}. Choose a stop from Search.`;
}

export function routeSearchFormReducer(
  state: RouteSearchFormState,
  action: RouteSearchFormAction,
): RouteSearchFormState {
  switch (action.type) {
    case 'edit':
      return { ...state, [action.field]: action.value, feedback: null, journeys: [] };
    case 'swap':
      return {
        origin: state.destination,
        destination: state.origin,
        feedback: null,
        journeys: [],
      };
    case 'submit': {
      const hasOrigin = state.origin.trim().length > 0;
      const hasDestination = state.destination.trim().length > 0;

      if (!hasOrigin || !hasDestination) {
        const message = !hasOrigin && !hasDestination
          ? 'Enter a starting location in From and a destination in To.'
          : !hasOrigin
            ? 'Enter a starting location in From.'
            : 'Enter a destination in To.';

        return { ...state, journeys: [], feedback: { kind: 'error', message } };
      }

      const origin = resolveStop(state.origin, action.dataset.stops);
      const destination = resolveStop(state.destination, action.dataset.stops);
      if (origin.status !== 'resolved') {
        return { ...state, journeys: [], feedback: { kind: 'error', message: resolutionMessage('From', origin.status) } };
      }
      if (destination.status !== 'resolved') {
        return { ...state, journeys: [], feedback: { kind: 'error', message: resolutionMessage('To', destination.status) } };
      }
      if (origin.stop.id === destination.stop.id) {
        return { ...state, journeys: [], feedback: { kind: 'error', message: 'Choose different From and To stops.' } };
      }
      const journeys = findJourneys(origin.stop.id, destination.stop.id,
        action.dataset.routes, action.dataset.stops, action.dataset.operators);
      return {
        ...state,
        journeys,
        feedback: {
          kind: 'results',
          message: journeys.length > 0
            ? `${journeys.length} sample ${journeys.length === 1 ? 'journey' : 'journeys'} found.`
            : 'No sample journey connects these stops within three segments.',
        },
      };
    }
  }
}
