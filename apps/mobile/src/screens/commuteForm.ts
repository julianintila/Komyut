import type { TransportStop } from '../features/transport/types';
export type CommuteLocation = { source: 'rail' | 'api'; stop: TransportStop };
export type CommuteForm = {
  origin: { text: string; location: CommuteLocation | null };
  destination: { text: string; location: CommuteLocation | null };
  activeField: 'origin' | 'destination' | null; submitted: boolean; feedback: string | null;
};
export const initialCommuteForm: CommuteForm = { origin: { text: '', location: null }, destination: { text: '', location: null }, activeField: null, submitted: false, feedback: null };
export type CommuteAction = { type: 'focus'; field: 'origin' | 'destination' } | { type: 'edit'; field: 'origin' | 'destination'; text: string }
  | { type: 'select'; location: CommuteLocation } | { type: 'swap' } | { type: 'submit' };
export function commuteFormReducer(state: CommuteForm, action: CommuteAction): CommuteForm {
  switch (action.type) {
    case 'focus': return { ...state, activeField: action.field };
    case 'edit': return { ...state, [action.field]: { text: action.text, location: null }, activeField: action.field, submitted: false, feedback: null };
    case 'select': return state.activeField ? { ...state, [state.activeField]: { text: action.location.stop.name, location: action.location }, activeField: null, submitted: false, feedback: null } : state;
    case 'swap': return { ...state, origin: state.destination, destination: state.origin, activeField: null, submitted: false, feedback: null };
    case 'submit': {
      const from = state.origin.location; const to = state.destination.location;
      const feedback = !state.origin.text.trim() || !state.destination.text.trim() ? 'Enter both From and To locations.'
        : !from || !to ? 'Choose each location from the search results.'
        : from.source === to.source && from.stop.id === to.stop.id ? 'Choose different From and To locations.' : null;
      return { ...state, activeField: null, submitted: !feedback, feedback };
    }
  }
}
