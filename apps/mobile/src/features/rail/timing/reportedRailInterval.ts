import headways from './data/2026-10-14/headways.json';
import manifest from './data/2026-10-14/manifest.json';
import type { RailLineId } from '../types';

const lineIds: readonly RailLineId[] = ['lrt1', 'lrt2', 'mrt3'];
const maximumSourceAgeDays = 30;
export const BUNDLED_HEADWAYS_SHA256 = 'c93f9cd11e5d93d4d9a5f593522e9ff6479c6bd841cf180bf00d8130e6f0779d';
export type ReportedRailInterval =
  | { status: 'unavailable'; reason: 'invalid_data' | 'invalid_request' | 'missing_source' | 'outdated' | 'future_source' }
  | { status: 'reported_interval'; minimumMinutes: number; maximumMinutes: number; isLive: false; nextArrivalAt: null;
      source: { name: string; url: string; generatedOn: string; sourceVerifiedOn: string; independentlyVerified: false } };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function https(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function clock(value: unknown): number {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid time');
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function intervals(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.length > 24) throw new Error('Invalid intervals');
  let previousEnd = -1;
  return value.map((band: unknown) => {
    if (!record(band) || typeof band.minutes !== 'number' || !Number.isFinite(band.minutes) || band.minutes <= 0 || band.minutes > 120) throw new Error('Invalid minutes');
    const from = clock(band.from); const until = clock(band.to);
    if (until <= from || from < previousEnd) throw new Error('Invalid bands');
    previousEnd = until;
    return band.minutes;
  });
}

/** Published intervals across recorded bands, not a departure prediction or service-open assertion. */
export function getReportedRailInterval(lineId: RailLineId, estimateDate: string, dataset: unknown = headways, sourceManifest: unknown = manifest): ReportedRailInterval {
  if (!lineIds.includes(lineId) || !date(estimateDate)) return { status: 'unavailable', reason: 'invalid_request' };
  try {
    if (!record(dataset) || dataset.schema_version !== 1 || !date(dataset.generated_on) || !record(dataset.lines)
      || !record(sourceManifest) || sourceManifest.schema_version !== 1 || !date(sourceManifest.generated_on)
      || dataset.generated_on > sourceManifest.generated_on || !record(sourceManifest.license)
      || sourceManifest.license.id !== 'CC-BY-4.0' || sourceManifest.license.url !== 'https://creativecommons.org/licenses/by/4.0/'
      || !record(sourceManifest.headways) || sourceManifest.headways.sha256 !== BUNDLED_HEADWAYS_SHA256) throw new Error('Invalid snapshot');
    const sources: Partial<Record<RailLineId, { name: string; url: string; verified: string; minutes: number[] }>> = {};
    for (const id of lineIds) {
      const line = dataset.lines[id];
      if (line === undefined || line === null) continue;
      if (!record(line)) throw new Error('Invalid line');
      if (line.source_name === null || line.source_url === null || line.verified_on === null) continue;
      if (typeof line.source_name !== 'string' || !line.source_name.trim() || !https(line.source_url)
        || !date(line.verified_on) || line.verified_on > dataset.generated_on) throw new Error('Invalid provenance');
      sources[id] = { name: line.source_name, url: line.source_url, verified: line.verified_on,
        minutes: [...intervals(line.weekday), ...intervals(line.weekend)] };
    }
    const source = sources[lineId];
    if (!source) return { status: 'unavailable', reason: 'missing_source' };
    if (estimateDate < dataset.generated_on || estimateDate < source.verified) return { status: 'unavailable', reason: 'future_source' };
    const age = (Date.parse(`${estimateDate}T00:00:00Z`) - Date.parse(`${source.verified}T00:00:00Z`)) / 86_400_000;
    if (age > maximumSourceAgeDays) return { status: 'unavailable', reason: 'outdated' };
    return { status: 'reported_interval', minimumMinutes: Math.min(...source.minutes), maximumMinutes: Math.max(...source.minutes), isLive: false, nextArrivalAt: null,
      source: { name: source.name, url: source.url, generatedOn: dataset.generated_on, sourceVerifiedOn: source.verified, independentlyVerified: false } };
  } catch { return { status: 'unavailable', reason: 'invalid_data' }; }
}
