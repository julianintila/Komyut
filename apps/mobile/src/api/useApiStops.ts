import { useEffect, useState } from 'react';
import type { StopType, TransportStop } from '../features/transport/types';
import { ApiError, transportApi } from './transportApi';
import type { ListResponse } from './transportApi';

export type ApiStopsState =
  | { status: 'sample' | 'loading' }
  | { status: 'success'; response: ListResponse<TransportStop> }
  | { status: 'error'; message: string };

export function useApiStops(query: string, type?: StopType) {
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ApiStopsState>({ status: 'sample' });
  const normalizedQuery = query.trim();
  useEffect(() => {
    if (!enabled) { setState({ status: 'sample' }); return; }
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      transportApi.fetchStops(normalizedQuery, type, controller.signal).then(
        (response) => { if (active) setState({ status: 'success', response }); },
        (error: unknown) => { if (active) setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Transport data is unavailable.' }); },
      );
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [enabled, normalizedQuery, type, attempt]);

  return { state, load: () => { setEnabled(true); setAttempt((value) => value + 1); }, useSamples: () => setEnabled(false) };
}
