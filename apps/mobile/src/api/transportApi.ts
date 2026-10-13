import type { StopType, TransportDataSource, TransportRoute, TransportStop, VehicleType } from '../features/transport/types';
import { hasValidCoordinates } from '../features/transport/mapStops';

export type ListResponse<T> = { data: T[]; meta: { limit: number; hasMore: boolean } };
export type ApiErrorKind = 'configuration' | 'http' | 'network' | 'timeout' | 'invalid_response' | 'cancelled';

export class ApiError extends Error {
  constructor(public readonly kind: ApiErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const stopTypes: readonly StopType[] = ['bus_stop', 'jeepney_stop', 'train_station', 'transport_terminal'];
const vehicleTypes: readonly VehicleType[] = ['bus', 'jeepney', 'train'];
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function invalid(): never {
  throw new ApiError('invalid_response', 'The API returned an invalid transport response.');
}
function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid();
  return value;
}
function source(value: unknown): TransportDataSource | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || !text(value.sourceName)) invalid();
  const verifiedOn = optionalText(value.verifiedOn);
  if (verifiedOn !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn)
    || !Number.isFinite(Date.parse(`${verifiedOn}T00:00:00.000Z`))
    || new Date(`${verifiedOn}T00:00:00.000Z`).toISOString().slice(0, 10) !== verifiedOn)) invalid();
  return { sourceName: value.sourceName, sourceUrl: optionalText(value.sourceUrl), verifiedOn, notes: optionalText(value.notes) };
}
function stop(value: unknown): TransportStop {
  if (!record(value) || !text(value.id) || !text(value.name) || !stopTypes.includes(value.type as StopType)) invalid();
  if (value.location !== undefined && !hasValidCoordinates(value.location)) invalid();
  return { id: value.id, name: value.name, type: value.type as StopType,
    location: value.location as TransportStop['location'], address: optionalText(value.address), source: source(value.source) };
}
function route(value: unknown): TransportRoute {
  if (!record(value) || !text(value.id) || !text(value.name) || !text(value.operatorId)
    || !vehicleTypes.includes(value.vehicleType as VehicleType) || !Array.isArray(value.stopIds)
    || !value.stopIds.every(text) || new Set(value.stopIds).size !== value.stopIds.length) invalid();
  return { id: value.id, name: value.name, operatorId: value.operatorId, vehicleType: value.vehicleType as VehicleType,
    stopIds: [...value.stopIds], source: source(value.source) };
}
function list<T extends { id: string }>(value: unknown, parse: (item: unknown) => T): ListResponse<T> {
  if (!record(value) || !Array.isArray(value.data) || !record(value.meta)
    || typeof value.meta.limit !== 'number' || !Number.isInteger(value.meta.limit)
    || value.meta.limit < 1 || value.meta.limit > 100 || typeof value.meta.hasMore !== 'boolean'
    || value.data.length > value.meta.limit) invalid();
  const data = value.data.map(parse);
  if (new Set(data.map((item) => item.id)).size !== data.length) invalid();
  return { data, meta: { limit: value.meta.limit, hasMore: value.meta.hasMore } };
}

export function createTransportApi(baseUrl: string | undefined, fetcher: typeof fetch = fetch, timeoutMs = 10000) {
  async function request<T>(path: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
    let base: URL;
    try {
      base = new URL(baseUrl?.trim() ?? '');
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
    } catch {
      throw new ApiError('configuration', 'Set a reachable EXPO_PUBLIC_API_BASE_URL without credentials or query parameters.');
    }
    const controller = new AbortController();
    let timedOut = false;
    let interrupt: (error: ApiError) => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => { interrupt = reject; });
    const cancel = () => { controller.abort(); interrupt(new ApiError('cancelled', 'Request cancelled.')); };
    if (signal?.aborted) throw new ApiError('cancelled', 'Request cancelled.');
    signal?.addEventListener('abort', cancel);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); interrupt(new ApiError('timeout', 'The API request timed out.')); }, timeoutMs);
    try {
      const operation = async () => {
        const response = await fetcher(`${base.href.replace(/\/$/, '')}/${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new ApiError('http', `Transport request failed (HTTP ${response.status}).`, response.status);
        let value: unknown;
        try { value = await response.json(); } catch { invalid(); }
        return parse(value);
      };
      return await Promise.race([operation(), interrupted]);
    } catch (error: unknown) {
      if (signal?.aborted) throw new ApiError('cancelled', 'Request cancelled.');
      if (timedOut) throw new ApiError('timeout', 'The API request timed out.');
      if (error instanceof ApiError) throw error;
      throw new ApiError('network', 'Could not reach the transport API. Check the connection and try again.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  return {
    fetchStops(query = '', type?: StopType, signal?: AbortSignal): Promise<ListResponse<TransportStop>> {
      const parameters = new URLSearchParams({ limit: '100' });
      if (query.trim()) parameters.set('q', query.trim());
      if (type) parameters.set('type', type);
      return request(`stops?${parameters}`, (value) => list(value, stop), signal);
    },
    fetchRoutes(signal?: AbortSignal): Promise<ListResponse<TransportRoute>> {
      return request('routes?limit=100', (value) => list(value, route), signal);
    },
  };
}

export const transportApi = createTransportApi(apiBaseUrl);
