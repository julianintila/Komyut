import { useEffect, useRef, useState } from 'react';
import type { RailActiveData } from '../persistence/createRailRepository';
import { getRailRepository } from './railRepository';

export type RailUiState = {
  status: 'loading' | 'ready' | 'refreshing' | 'error';
  active?: RailActiveData;
  message?: string;
};

export function useRailData() {
  const [state, setState] = useState<RailUiState>({ status: 'loading' });
  const mounted = useRef(false);
  const busy = useRef(false);
  const sequence = useRef(0);

  async function run(refresh: boolean): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    const request = ++sequence.current;
    setState((previous) => ({ status: refresh ? 'refreshing' : 'loading', active: previous.active }));
    try {
      const repository = getRailRepository();
      if (refresh) {
        const result = await repository.refresh();
        if (mounted.current && request === sequence.current) {
          setState({ status: result.status === 'failed' ? 'error' : 'ready', active: result.active,
            message: result.status === 'failed' ? result.message : result.status === 'unchanged' ? 'Rail data is unchanged.' : 'Rail data refreshed.' });
        }
      } else {
        const active = await repository.load();
        if (mounted.current && request === sequence.current) setState({ status: 'ready', active });
      }
    } catch {
      if (mounted.current && request === sequence.current) {
        setState((previous) => ({ status: 'error', active: previous.active, message: 'Rail data could not be initialized or refreshed. Try again.' }));
      }
    } finally { if (request === sequence.current) busy.current = false; }
  }

  useEffect(() => {
    mounted.current = true;
    void run(false);
    return () => { mounted.current = false; sequence.current++; busy.current = false; };
  }, []);

  return { state, retry: () => run(false), refresh: () => run(true) };
}
