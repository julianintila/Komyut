import { hasValidCoordinates } from '../transport/mapStops';
import type { RailBundle, RailFareStructure, RailLine, RailLineId, RailModifier, RailStation } from './types';

export const RAIL_ATTRIBUTION = 'Fare and station data: TrainsPh (https://trains.ph), CC BY 4.0';
export const RAIL_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const RAIL_LINE_IDS: readonly RailLineId[] = ['lrt1', 'lrt2', 'mrt3'];
const identities = {
  lrt1: ['LRT-1', 'LRT Line 1', 'Light Rail Manila Corporation (LRMC)', 'trainsph-lrmc'],
  lrt2: ['LRT-2', 'LRT Line 2', 'Light Rail Transit Authority (LRTA)', 'trainsph-lrta'],
  mrt3: ['MRT-3', 'MRT Line 3', 'DOTr-MRT3', 'trainsph-dotr-mrt3'],
} as const;

export class RailDataValidationError extends Error {
  constructor(field: string) {
    super(`Invalid rail dataset: ${field}.`);
    this.name = 'RailDataValidationError';
  }
}

function requireValue(condition: boolean, field: string): asserts condition {
  if (!condition) throw new RailDataValidationError(field);
}
function object(value: unknown, field: string): Record<string, unknown> {
  requireValue(typeof value === 'object' && value !== null && !Array.isArray(value), field);
  return value as Record<string, unknown>;
}
function list(value: unknown, field: string): unknown[] {
  requireValue(Array.isArray(value), field);
  return value;
}
function text(value: unknown, field: string): string {
  requireValue(typeof value === 'string' && value.trim().length > 0, field);
  return value;
}
export function isRailDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function date(value: unknown, field: string): string {
  requireValue(isRailDate(value), field);
  return value;
}
function url(value: unknown, field: string): string {
  const result = text(value, field);
  requireValue(/^https:\/\/[^\s/?#]+(?:\/[^\s]*)?$/.test(result) && !result.includes('@'), field);
  return result;
}
function integer(value: unknown, field: string): number {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, field);
  return value;
}
function centavos(value: unknown, field: string): number {
  const pesos = integer(value, field);
  requireValue(pesos > 0 && pesos <= Math.floor(Number.MAX_SAFE_INTEGER / 100), field);
  return pesos * 100;
}
function boolean(value: unknown, field: string): boolean {
  requireValue(typeof value === 'boolean', field);
  return value;
}

function modifiers(value: unknown, lineId: RailLineId, generatedOn: string): RailModifier[] {
  const seen = new Set<string>();
  return list(value, `${lineId}.modifiers`).map((item) => {
    const record = object(item, `${lineId}.modifier`);
    const id = text(record.id, 'modifier.id');
    requireValue(!seen.has(id), 'duplicate modifier.id');
    seen.add(id);
    requireValue(record.type === 'percentage' && record.stacks === false, 'unsupported modifier type/stacking');
    requireValue(typeof record.value === 'number' && Number.isInteger(record.value) && record.value < 0 && record.value >= -100, 'modifier.value');
    const effectiveFrom = date(record.effective_from, 'modifier.effective_from');
    const effectiveUntil = record.effective_until === null ? null : date(record.effective_until, 'modifier.effective_until');
    requireValue(effectiveUntil === null || effectiveUntil >= effectiveFrom, 'modifier date range');
    const lastConfirmed = date(record.last_confirmed, 'modifier.last_confirmed');
    requireValue(lastConfirmed >= effectiveFrom && lastConfirmed <= generatedOn, 'modifier confirmation date');
    const appliesToLines = record.applies_to_lines === undefined ? [lineId] : list(record.applies_to_lines, 'modifier.applies_to_lines').map((id) => {
      requireValue(RAIL_LINE_IDS.includes(id as RailLineId), 'modifier line reference');
      return id as RailLineId;
    });
    requireValue(appliesToLines.includes(lineId) && new Set(appliesToLines).size === appliesToLines.length, 'modifier applicability');
    return {
      id, label: text(record.label, 'modifier.label'), percentage: record.value,
      requiresUserSelection: boolean(record.requires_user_selection, 'modifier.requires_user_selection'),
      ...(record.requires === undefined ? {} : { requirement: text(record.requires, 'modifier.requires') }),
      effectiveFrom, effectiveUntil, appliesToLines, sourceUrl: url(record.source_url, 'modifier.source_url'),
      lastConfirmed, notes: text(record.note, 'modifier.note'),
      stackingNote: text(record.stacking_note, 'modifier.stacking_note'), stacks: false, independentlyVerified: false,
    };
  });
}

function fares(data: Record<string, unknown>, id: RailLineId, stations: readonly RailStation[]): RailFareStructure {
  const fare = object(data.fares, `${id}.fares`);
  const products = object(data.products, `${id}.products`);
  requireValue(fare.currency === 'PHP', 'fare currency');
  if (id === 'mrt3') {
    requireValue(fare.model === 'distance_bands' && fare.product === 'fare' && Object.keys(products).join() === 'fare', 'MRT fare/product model');
    requireValue(object(products.fare, 'products.fare').storage === 'distance_bands', 'MRT product storage');
    const bands = list(fare.bands, 'fare.bands').map((item) => {
      const band = object(item, 'fare.band');
      return { minSpan: integer(band.min_span, 'band.min_span'), fareCentavos: centavos(band.fare, 'band.fare') };
    });
    requireValue(bands.length > 0 && bands[0].minSpan === 0 && bands.every((band, i) => band.minSpan < stations.length && (i === 0 || band.minSpan > bands[i - 1].minSpan && band.fareCentavos >= bands[i - 1].fareCentavos)), 'band order/coverage');
    return { type: 'station_bands', bands };
  }
  requireValue(fare.model === 'matrix' && fare.product === 'beep', 'LRT fare model');
  requireValue(Object.keys(products).sort().join() === 'beep,single_journey', 'LRT products');
  requireValue(object(products.beep, 'products.beep').storage === 'matrix', 'beep storage');
  const single = object(products.single_journey, 'products.single_journey');
  requireValue(single.storage === 'derived' && single.from === 'beep' && single.rule === 'ceil(x/5)*5', 'unsupported ticket derivation');
  const names = list(fare.station_order, 'fare.station_order');
  requireValue(names.length === stations.length && names.every((name, i) => name === stations[i].name), 'matrix station references/order');
  const rows = list(fare.matrix, 'fare.matrix');
  requireValue(rows.length === stations.length, 'matrix height');
  const matrixCentavos = rows.map((item, i) => {
    const row = list(item, 'matrix row');
    requireValue(row.length === stations.length, 'matrix width');
    return row.map((value, j) => {
      if (i === j) { requireValue(value === 0, 'matrix diagonal'); return 0; }
      return centavos(value, 'matrix fare');
    });
  });
  // Reverse fare lookup is supported by this matrix, not by inferred route services.
  requireValue(matrixCentavos.every((row, i) => row.every((value, j) => value === matrixCentavos[j][i])), 'matrix symmetry');
  return { type: 'matrix', stationIds: stations.map((station) => station.id), matrixCentavos };
}

/** Structural validation only. Original-byte integrity is a separate operation. */
export function validateRailBundle(manifestValue: unknown, files: Readonly<Record<RailLineId, unknown>>): RailBundle {
  const manifest = object(manifestValue, 'manifest');
  requireValue(manifest.schema_version === 1, 'manifest.schema_version');
  const generatedOn = date(manifest.generated_on, 'manifest.generated_on');
  const license = object(manifest.license, 'manifest.license');
  requireValue(license.id === 'CC-BY-4.0' && license.url === RAIL_LICENSE_URL && license.attribution === RAIL_ATTRIBUTION, 'manifest license/attribution');
  const entries = list(manifest.lines, 'manifest.lines').map((entry) => object(entry, 'manifest line'));
  requireValue(entries.length === 3 && new Set(entries.map((entry) => entry.id)).size === 3 && entries.every((entry) => RAIL_LINE_IDS.includes(entry.id as RailLineId)), 'manifest line identities');
  requireValue(Object.keys(files).sort().join() === 'lrt1,lrt2,mrt3', 'dataset collection');
  const allIds = new Map<string, RailLineId>();
  const references: { stationId: string; lineId: string }[] = [];
  const lines: RailLine[] = RAIL_LINE_IDS.map((id) => {
    const entry = entries.find((entry) => entry.id === id)!;
    requireValue(typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256), 'manifest.sha256');
    requireValue(integer(entry.bytes, 'manifest.bytes') > 0, 'manifest.bytes');
    const data = object(files[id], id);
    requireValue(data.schema_version === 1, `${id}.schema_version`);
    const line = object(data.line, `${id}.line`);
    const [code, name, operatorName, operatorId] = identities[id];
    requireValue(line.id === id && line.code === code && line.name === name && line.operator === operatorName && line.status === 'operational' && entry.code === code && entry.status === 'operational', `${id}.identity/status`);
    const rawSource = object(data.provenance, `${id}.provenance`);
    const lineGeneratedOn = date(rawSource.generated_on, 'provenance.generated_on');
    const sourceVerifiedOn = date(rawSource.verified_on, 'provenance.verified_on');
    const faresEffectiveFrom = date(rawSource.fares_effective_from, 'provenance.fares_effective_from');
    requireValue(lineGeneratedOn <= generatedOn && sourceVerifiedOn === entry.verified_on && faresEffectiveFrom === entry.fares_effective_from && sourceVerifiedOn <= lineGeneratedOn && faresEffectiveFrom <= sourceVerifiedOn, 'provenance dates');
    const provenance = {
      datasetUrl: `https://trainsph-data.web.app/${id}.json`, generatedOn: lineGeneratedOn, sourceVerifiedOn, faresEffectiveFrom,
      underlyingSourceUrl: url(rawSource.source_url, 'provenance.source_url'),
      sourceNote: text(rawSource.source_note, 'provenance.source_note'), verificationNote: text(rawSource.verified_note, 'provenance.verified_note'),
      confidenceClaim: text(rawSource.confidence, 'provenance.confidence'), independentlyVerified: false as const,
    };
    const source = { sourceName: 'TrainsPh', sourceUrl: provenance.datasetUrl, notes: `${RAIL_ATTRIBUTION}. Source fare verification claim: ${sourceVerifiedOn}; not independently verified by Komyut.` };
    const stations = list(data.stations, `${id}.stations`).map((item): RailStation => {
      const station = object(item, 'station');
      const stationId = text(station.id, 'station.id');
      requireValue(new RegExp(`^${id}_[a-z0-9_]+$`).test(stationId) && stationId.length <= 64 && !allIds.has(stationId), 'station ID/duplicate');
      allIds.set(stationId, id);
      const location = { latitude: station.lat, longitude: station.lng };
      requireValue(hasValidCoordinates(location), 'station coordinates');
      for (const linkValue of list(station.interchanges, 'station.interchanges')) {
        const link = object(linkValue, 'interchange reference');
        references.push({ stationId: text(link.station_id, 'interchange.station_id'), lineId: text(link.line_id, 'interchange.line_id') });
      }
      const formerNames = list(station.former_names, 'station.former_names').map((name) => text(name, 'station former name'));
      const coordinatesVerifiedClaim = boolean(station.coordinates_verified, 'station.coordinates_verified');
      const coordinatesSourceVerifiedOn = station.coordinates_verified_on === undefined ? undefined : date(station.coordinates_verified_on, 'station.coordinates_verified_on');
      const coordinatesVerifiedAgainst = station.coordinates_verified_against === undefined ? undefined : text(station.coordinates_verified_against, 'station.coordinates_verified_against');
      requireValue(coordinatesSourceVerifiedOn === undefined || coordinatesSourceVerifiedOn <= lineGeneratedOn, 'coordinate verification date');
      requireValue(!coordinatesVerifiedClaim || coordinatesSourceVerifiedOn !== undefined && coordinatesVerifiedAgainst !== undefined, 'coordinate verification claim metadata');
      return {
        id: stationId, name: text(station.name, 'station.name'), type: 'train_station', lineId: id,
        location, source, ordinal: integer(station.ordinal, 'station.ordinal'), fullName: text(station.full_name, 'station.full_name'), formerNames,
        coordinatesSource: text(station.coordinates_source, 'station.coordinates_source'),
        coordinatesVerifiedClaim,
        ...(coordinatesSourceVerifiedOn === undefined ? {} : { coordinatesSourceVerifiedOn }),
        ...(coordinatesVerifiedAgainst === undefined ? {} : { coordinatesVerifiedAgainst }),
      };
    }).sort((a, b) => a.ordinal - b.ordinal);
    requireValue(stations.length >= 2 && stations.every((station, i) => station.ordinal === i + 1) && new Set(stations.map((station) => station.name)).size === stations.length, 'station ordinals/ambiguous names');
    return {
      id, code, name, stations, provenance, operator: { id: operatorId, name: operatorName, vehicleTypes: ['train'], source },
      fareStructure: fares(data, id, stations), modifiers: modifiers(data.modifiers, id, lineGeneratedOn),
    };
  });
  requireValue(references.every((reference) => allIds.get(reference.stationId) === reference.lineId), 'unknown interchange station/line reference');
  return { schemaVersion: 1, generatedOn, attribution: RAIL_ATTRIBUTION, licenseUrl: RAIL_LICENSE_URL, lines, stations: lines.flatMap((line) => line.stations) };
}
