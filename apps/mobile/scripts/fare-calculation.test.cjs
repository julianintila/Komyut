const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/features/fares/calculateFare.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const result = { exports: {} };
new Function('exports', source)(result.exports);
const { calculateFare } = result.exports;

// All numbers and metadata below are synthetic unit-test fixtures, not Philippine fares.
// The simulated verified policy exists only to exercise the trusted-policy branch.
const rule = (structure, extra = {}) => ({
  id: 'test-fare', name: 'Fictional calculation fixture', vehicleType: 'bus',
  currency: 'PHP', provenance: { reliability: 'unverified' }, structure, ...extra,
});
const fixed = rule({ type: 'fixed', amountCentavos: 1234 });
const journey = { vehicleType: 'bus' };
const distanceRule = (rounding = 'up', extra = {}) => rule({
  type: 'distance_based', baseFareCentavos: 1000, includedDistanceKm: 2,
  increment: { distanceKm: 0.5, amountCentavos: 75, rounding }, ...extra,
});
const policy = {
  id: 'test-discount', name: 'Synthetic unit-test policy', rateBasisPoints: 1250,
  rounding: 'nearest', conditions: { vehicleTypes: ['bus'] },
  provenance: {
    reliability: 'verified',
    source: { sourceName: 'Simulated unit-test provenance; not official', verifiedOn: '2024-01-01', notes: 'Fictional policy and rate.' },
  },
};

test('fixed fares return configured integer centavos and provenance', () => {
  assert.deepEqual(calculateFare(fixed, journey), {
    status: 'regular', currency: 'PHP', amountCentavos: 1234, regularFareCentavos: 1234,
    provenance: fixed.provenance, discount: { status: 'not_requested' },
  });
});

test('rule applicability respects vehicle, operator, and inclusive effective dates', () => {
  const scoped = { ...fixed, operatorId: 'test-operator', effectiveFrom: '2024-01-01', effectiveUntil: '2024-01-31' };
  for (const day of ['2024-01-01', '2024-01-31']) {
    assert.equal(calculateFare(scoped, { ...journey, operatorId: 'test-operator', date: day }).status, 'regular');
  }
  assert.equal(calculateFare(scoped, journey).status, 'invalid_journey');
  for (const input of [
    { ...journey, operatorId: 'other', date: '2024-01-01' },
    { vehicleType: 'train', operatorId: 'test-operator', date: '2024-01-01' },
    { ...journey, operatorId: 'test-operator', date: '2024-02-01' },
  ]) assert.deepEqual(calculateFare(scoped, input), { status: 'unknown', reason: 'not_applicable' });
});

test('up-rounded distance increments include exact base and increment boundaries', () => {
  for (const [distanceKm, expected] of [[0, 1000], [2, 1000], [2.001, 1075], [2.5, 1075], [2.501, 1150], [3, 1150]]) {
    assert.equal(calculateFare(distanceRule(), { ...journey, distanceKm }).amountCentavos, expected);
  }
});

test('down and nearest increment rounding are explicit, including half-up ties', () => {
  assert.equal(calculateFare(distanceRule('down'), { ...journey, distanceKm: 2.49 }).amountCentavos, 1000);
  assert.equal(calculateFare(distanceRule('down'), { ...journey, distanceKm: 2.5 }).amountCentavos, 1075);
  assert.equal(calculateFare(distanceRule('nearest'), { ...journey, distanceKm: 2.249 }).amountCentavos, 1000);
  assert.equal(calculateFare(distanceRule('nearest'), { ...journey, distanceKm: 2.25 }).amountCentavos, 1075);
});

test('minimum fare is a floor, not an extra charge', () => {
  const configured = distanceRule('up', { minimumFareCentavos: 1100 });
  assert.equal(calculateFare(configured, { ...journey, distanceKm: 0 }).amountCentavos, 1100);
  assert.equal(calculateFare(configured, { ...journey, distanceKm: 3 }).amountCentavos, 1150);
});

test('decimal distances avoid binary rounding errors at boundaries', () => {
  const configured = rule({
    type: 'distance_based', baseFareCentavos: 1, includedDistanceKm: 0.1,
    increment: { distanceKm: 0.1, amountCentavos: 1, rounding: 'up' },
  });
  assert.equal(calculateFare(configured, { ...journey, distanceKm: 0.3 }).amountCentavos, 3);
  const scientific = rule({
    ...configured.structure, includedDistanceKm: 1e-7,
    increment: { ...configured.structure.increment, distanceKm: 1e-7 },
  });
  assert.equal(calculateFare(scientific, { ...journey, distanceKm: 3e-7 }).amountCentavos, 3);
});

test('station pairs are directed and missing pairs are unknown', () => {
  const configured = rule({ type: 'station_pair', fares: [
    { originStopId: 'test-a', destinationStopId: 'test-b', amountCentavos: 1500 },
    { originStopId: 'test-b', destinationStopId: 'test-a', amountCentavos: 1700 },
  ] }, { vehicleType: 'train' });
  const rail = { vehicleType: 'train', originStopId: 'test-a', destinationStopId: 'test-b' };
  assert.equal(calculateFare(configured, rail).amountCentavos, 1500);
  assert.equal(calculateFare(configured, { ...rail, originStopId: 'test-b', destinationStopId: 'test-a' }).amountCentavos, 1700);
  assert.deepEqual(calculateFare(configured, { ...rail, destinationStopId: 'test-c' }), { status: 'unknown', reason: 'station_pair_missing' });
  assert.equal(calculateFare(configured, { vehicleType: 'train' }).status, 'invalid_journey');
});

test('unconfigured is unknown, while an explicitly configured zero is a valid fare', () => {
  assert.deepEqual(calculateFare(rule({ type: 'unconfigured' }), journey), { status: 'unknown', reason: 'unconfigured' });
  assert.equal(calculateFare(rule({ type: 'fixed', amountCentavos: 0 }), journey).amountCentavos, 0);
});

test('discount requires an explicit qualifying passenger and trusted supplied policy', () => {
  const fare = calculateFare(fixed, journey, { policy, eligible: true });
  assert.equal(fare.status, 'discounted');
  assert.equal(fare.amountCentavos, 1080);
  assert.equal(fare.regularFareCentavos, 1234);
  assert.equal(fare.discountCentavos, 154);
  assert.equal(fare.discountPolicyId, policy.id);
  assert.deepEqual(fare.discountProvenance, policy.provenance);
});

test('false or unknown eligibility never silently applies a discount', () => {
  const notEligible = calculateFare(fixed, journey, { policy, eligible: false });
  assert.equal(notEligible.amountCentavos, 1234);
  assert.deepEqual(notEligible.discount, { status: 'not_eligible' });
  const unknown = calculateFare(fixed, journey, { policy });
  assert.equal(unknown.status, 'regular');
  assert.deepEqual(unknown.discount, { status: 'unavailable', reason: 'eligibility_unknown' });
});

test('missing or unverified policy and unmet conditions retain the regular fare', () => {
  for (const [request, reason] of [
    [{ eligible: true }, 'missing_policy'],
    [{ eligible: true, policy: { ...policy, provenance: { reliability: 'unverified' } } }, 'unverified_policy'],
    [{ eligible: true, policy: { ...policy, conditions: { vehicleTypes: ['train'] } } }, 'conditions_not_met'],
    [{ eligible: true, policy: { ...policy, conditions: { vehicleTypes: ['bus'], operatorIds: ['other'] } } }, 'conditions_not_met'],
  ]) {
    const fare = calculateFare(fixed, journey, request);
    assert.equal(fare.amountCentavos, 1234);
    assert.deepEqual(fare.discount, { status: 'unavailable', reason });
  }
});

test('discount rounds the payable fare, with exact half-up centavos', () => {
  const tiny = rule({ type: 'fixed', amountCentavos: 1 });
  for (const [rounding, expected] of [['up', 1], ['down', 0], ['nearest', 1]]) {
    assert.equal(calculateFare(tiny, journey, { eligible: true, policy: { ...policy, rateBasisPoints: 5000, rounding } }).amountCentavos, expected);
  }
});

test('large money intermediates remain exact without floating-point multiplication', () => {
  const huge = rule({ type: 'fixed', amountCentavos: Number.MAX_SAFE_INTEGER });
  const amount = calculateFare(huge, journey, { eligible: true, policy: { ...policy, rateBasisPoints: 1, rounding: 'down' } }).amountCentavos;
  assert.equal(amount, Number(BigInt(Number.MAX_SAFE_INTEGER) * 9999n / 10000n));
});

test('invalid or missing distances are invalid journeys, never free fares', () => {
  assert.equal(calculateFare(distanceRule(), journey).status, 'invalid_journey');
  for (const distanceKm of [-1, NaN, Infinity, -Infinity, '2']) {
    assert.equal(calculateFare(distanceRule(), { ...journey, distanceKm }).status, 'invalid_journey');
    assert.equal(calculateFare(fixed, { ...journey, distanceKm }).status, 'invalid_journey');
  }
  assert.equal(calculateFare(fixed, null).status, 'invalid_journey');
});

test('invalid money, increments, and rounding are invalid configurations', () => {
  for (const amountCentavos of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
    assert.equal(calculateFare(rule({ type: 'fixed', amountCentavos }), journey).status, 'invalid_configuration');
  }
  for (const increment of [null, { distanceKm: 0, amountCentavos: 1, rounding: 'up' },
    { distanceKm: 1, amountCentavos: -1, rounding: 'up' }, { distanceKm: 1, amountCentavos: 1, rounding: 'other' }]) {
    assert.equal(calculateFare(rule({ ...distanceRule().structure, increment }), { ...journey, distanceKm: 3 }).status, 'invalid_configuration');
  }
  assert.equal(calculateFare(distanceRule('up', { minimumFareCentavos: -1 }), journey).status, 'invalid_configuration');
});

test('invalid tables, dates, provenance, or unknown structures are rejected', () => {
  const pair = { originStopId: 'a', destinationStopId: 'b', amountCentavos: 1 };
  for (const fares of [[], [pair, pair], [{ ...pair, amountCentavos: NaN }]]) {
    assert.equal(calculateFare(rule({ type: 'station_pair', fares }), journey).status, 'invalid_configuration');
  }
  for (const extra of [
    { effectiveFrom: '2024-02-30' }, { effectiveFrom: '2024-02-01', effectiveUntil: '2024-01-01' },
    { provenance: { reliability: 'verified' } }, { currency: 'USD' },
  ]) assert.equal(calculateFare({ ...fixed, ...extra }, journey).status, 'invalid_configuration');
  assert.equal(calculateFare(fixed, { ...journey, date: '2023-02-29' }).status, 'invalid_journey');
  assert.equal(calculateFare(rule({ type: 'unconfigured', amountCentavos: 0 }), journey).status, 'invalid_configuration');
  assert.equal(calculateFare(rule({ type: 'other' }), journey).status, 'invalid_configuration');
  assert.equal(calculateFare(null, journey).status, 'invalid_configuration');
});

test('malformed discount policies are explicit configuration errors', () => {
  for (const invalid of [
    { ...policy, rateBasisPoints: -1 }, { ...policy, rateBasisPoints: 10001 },
    { ...policy, rateBasisPoints: 0.5 }, { ...policy, rounding: 'other' },
    { ...policy, conditions: { vehicleTypes: [] } }, { ...policy, provenance: { reliability: 'verified' } },
  ]) assert.equal(calculateFare(fixed, journey, { eligible: true, policy: invalid }).status, 'invalid_configuration');
  assert.equal(calculateFare(fixed, journey, { eligible: 'yes', policy }).status, 'invalid_configuration');
});

test('calculation overflow is an error, not an unsafe amount or zero', () => {
  const configured = distanceRule('up', { baseFareCentavos: Number.MAX_SAFE_INTEGER });
  assert.equal(calculateFare(configured, { ...journey, distanceKm: 3 }).status, 'invalid_configuration');
});

test('identical inputs are deterministic and remain unmodified', () => {
  const configured = distanceRule();
  const input = { ...journey, distanceKm: 2.25 };
  const request = { policy, eligible: true };
  const before = JSON.stringify([configured, input, request]);
  const first = calculateFare(configured, input, request);
  assert.deepEqual(calculateFare(configured, input, request), first);
  assert.equal(JSON.stringify([configured, input, request]), before);
});

test('supplied zero and full discount rates, and matching operator conditions, are honored', () => {
  for (const [rateBasisPoints, expected] of [[0, 1234], [10000, 0]]) {
    const configured = { ...policy, rateBasisPoints, conditions: { vehicleTypes: ['bus'], operatorIds: ['test-operator'] } };
    const fare = calculateFare(fixed, { ...journey, operatorId: 'test-operator' }, { eligible: true, policy: configured });
    assert.equal(fare.status, 'discounted');
    assert.equal(fare.amountCentavos, expected);
  }
});

test('non-finite distance configurations and malformed optional policy conditions are rejected', () => {
  for (const includedDistanceKm of [-1, Infinity, NaN]) {
    assert.equal(calculateFare(distanceRule('up', { includedDistanceKm }), journey).status, 'invalid_configuration');
  }
  for (const operatorIds of [[], [''], [1], null]) {
    assert.equal(calculateFare(fixed, journey, {
      eligible: true, policy: { ...policy, conditions: { vehicleTypes: ['bus'], operatorIds } },
    }).status, 'invalid_configuration');
  }
});
