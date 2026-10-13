# Intended Architecture

## Product

Komyut is a Philippine Commuter Guide for public transportation fares,
terminals, stations, and step-by-step routes.

## Technology Decisions

| Component | Technology | Initialization |
| --- | --- | --- |
| Mobile application | React Native, Expo, TypeScript | Brick 1, `apps/mobile/` |
| Public website | Next.js, TypeScript | Brick 16 |
| API | Laravel 12, PHP, Composer | Brick 13, `apps/api/` |
| Database | PostgreSQL schema definitions | Brick 14, `apps/api/database/migrations/` |

Brick 1 uses Expo's standard `blank-typescript` template. Brick 3 adds React
Navigation while retaining the `index.ts` and `App.tsx` entry points.
Dependencies are managed with npm and the generated
package lockfile. No root workspace tooling or shared package is required yet.
The mobile application retains its template entry point, assets, and structure.

## Mobile Styling (Brick 2)

Design tokens live in `apps/mobile/src/styles/tokens.ts`. This directory is also
the location for shared styling utilities when repeated styling needs justify
them; no utility abstraction or component library is needed yet.

- `colors`: semantic roles for primary navy, light neutral background, white
  surface, dark text, secondary text, border, green success, amber warning, and
  red error. Status colors are intended as foregrounds on background or surface;
  use `colors.surface` for text on a primary or status-colored background.
- `typography`: matching `caption`, `body`, and `title` font sizes and line
  heights, with `regular`, `medium`, and `bold` font weights. Use system fonts.
- `spacing`: `xs`, `sm`, `md`, `lg`, and `xl` form a 4/8/16/24/32 scale.
- `radii`: `sm` (4) and `md` (8). There are no shadows or elevation tokens until
  an approved screen needs them.

Exports use `as const` and `satisfies` to retain literal types and validate
React Native-compatible values. Token-name types are exported for typed callers.
Use direct imports with component-local `StyleSheet.create`:

```typescript
import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from './src/styles/tokens';

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  text: {
    color: colors.text,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.body,
  },
});
```

Adjust the relative import to the caller's location. Reuse matching tokens
instead of repeating literal colors, spacing, font sizes, or radii. Layout
values such as `flex: 1` remain local. Keep text scaling enabled and avoid fixed
text heights or truncation solely to fit a layout. Convey status with text or
icons as well as color when status UI is introduced.

Before adding a token, check whether an existing role or scale value fits. Add
only a value justified by an approved feature, use semantic camelCase names for
colors and typography roles, and retain the shared size scale for spacing and
radii. Update this documentation, run TypeScript, and check contrast for the
actual foreground/background pair (at least 4.5:1 for normal text and 3:1 for
essential non-text indicators). Do not add speculative themes or variants.

The navigation shell uses the same tokens through component-local styles and
`src/styles/screenStyles.ts`. Native device rendering and enlarged-text behavior
still require device verification.
Contrast calculations against background and surface pass: text and semantic
foreground colors range from 5.90:1 to 16.29:1, and borders from 3.41:1 to 3.66:1.
These ratios apply to the documented pairs, not arbitrary token combinations.

## Mobile Navigation (Brick 3)

The project had no Expo Router configuration. Following the user's Brick 3
instructions, `App.tsx` remains the root component and wraps the navigation shell
in `SafeAreaProvider`. `src/navigation/MobileNavigator.tsx` uses React
Navigation's bottom-tab navigator with a typed `TabParamList` and Home as the
initial route. It registers Home, Search, Nearby, and Saved. Each has a small
screen in `src/screens/`. Brick 4 adds a local form to Home; Brick 7 connects
Search to the fictional sample stops. Nearby and Saved remain placeholders.
There are no maps, saved-route storage, fare calculations, or verified transport data.

The navigation dependencies are `@react-navigation/native`,
`@react-navigation/bottom-tabs`, `react-native-screens`, and
`react-native-safe-area-context`, installed through Expo's dependency resolver.
There is no icon library in the starter, so tabs use labels without adding one.
References: [React Navigation setup](https://reactnavigation.org/docs/getting-started/)
and [safe-area guidance](https://reactnavigation.org/docs/handling-safe-area/).

`src/navigation/TabBar.tsx` is a focused label-only bar. It emits standard
`tabPress` and `tabLongPress` events, respects cancelled presses, and delegates
route changes to React Navigation. Selected tabs use primary navy, white text,
and bold weight; inactive labels use secondary text. Tabs expose their selected
state and tab role to accessibility services. Styling uses existing tokens;
48 is a local minimum touch-target height, and the separator uses the native
hairline width. No fixed bar height, text truncation, or absolute positioning is
used. Text can wrap and scale, and the bar can grow with its content.

The bar applies bottom/left/right safe-area padding. Screens apply top/left/right
padding and use a `ScrollView`. Since the bar occupies normal navigator layout
space, screen content is not placed beneath it. Native inset measurements come
from `react-native-safe-area-context`, not hardcoded device offsets.

`npm run check:navigation` uses Node's built-in test runner and the existing
TypeScript compiler. It checks default selection, screen registration, tab
press routing through the actual `TabRouter`, cancelled/repeated presses,
long-press events, selected styling, and safe-area configuration. Native host
components and navigator mounting are stubbed; this is not an emulator or native
layout test. Verify notches, gesture areas, small screens, and enlarged text on
a device before release.

## Initial Route Form (Brick 4)

`src/screens/HomeScreen.tsx` presents the app heading, purpose, controlled From
and To inputs, Swap locations, and Find Routes. GMA, Cavite and PITX appear only
as empty-field examples, with an explicit notice that route data is unavailable.
No sample or recent-search section is introduced.

`src/screens/routeSearchForm.ts` is a small, typed, screen-local reducer. It
handles edits, swapping, and submission without global state or data services.
Whitespace-only input counts as empty. Missing fields produce specific messages;
a valid pair produces an honest future-search placeholder with no results or
fares. Editing or swapping clears stale feedback and preserves entered text.

The screen retains top/left/right safe areas and uses `KeyboardAvoidingView`
(padding on iOS, height on Android) around a scrollable form. Handled taps let
buttons work while the keyboard is open; dragging dismisses it, and submitting
dismisses it. The From keyboard action focuses To. Inputs have persistent labels
and accessibility labels. Feedback uses an Android live region and explicit iOS
accessibility announcements. Missing-input borders also use the error token.
Inputs and buttons have a minimum 48-point touch height; text and button heights
can grow with font scaling. All colors, typography, spacing, and radii reuse the
existing tokens. The navigation implementation and other tabs are unchanged.

`npm run check:route-search` runs eight reducer tests using the existing Node
test runner and TypeScript transpilation pattern. They cover both empty fields,
each missing field, whitespace, swapping complete or partial values, a valid
submission, and editing after feedback. Navigation checks also verify Home's
control wiring and keyboard/scroll configuration. These checks stub native hosts
and React hooks; they do not verify actual rendering, keyboard measurements,
focus, or screen-reader announcements on a device. No dependency was added.
Reference: [React Native keyboard avoidance](https://reactnative.dev/docs/keyboardavoidingview).

Brick 10 replaces the original future-search placeholder with direct sample-route
results and adds a dataset argument to submit actions; see Direct Route Finding below.

## Transport Models (Brick 5)

Framework-independent contracts live in `apps/mobile/src/features/transport/types.ts`
and are re-exported with `export type` from `src/features/transport/index.ts`.
Import them with `import type`. They do not import React, React Native, navigation,
styling, or backend code, and introduce no runtime data or behavior.

| Model | Fields |
| --- | --- |
| `GeographicCoordinates` | Numeric `latitude`, `longitude` |
| `TransportStop` | String `id`, `name`; `type`; optional `location`, `address`, `source` |
| `TransportOperator` | String `id`, `name`; optional `vehicleTypes`, `source` |
| `TransportRoute` | String `id`, `name`, `operatorId`; `vehicleType`; ordered `stopIds`; optional `source` |
| `TransportDataSource` | `sourceName`; optional `sourceUrl`, `verifiedOn`, `notes` |

`StopType` is the closed union `bus_stop`, `jeepney_stop`, `train_station`, and
`transport_terminal`. A terminal is a stop with `type: 'transport_terminal'`;
there is no separate terminal model until distinct fields are needed.
`VehicleType` initially supports `bus`, `jeepney`, and `train`. These are the
initial supported modes, not a comprehensive list of Philippine transport.
Extend the unions in an approved task when additional modes are actually needed.

IDs are stable, opaque strings, not display names or array indexes. Each route
references an operator by `operatorId` and stops by `stopIds` in intended travel
order. Treat a route as one travel direction; do not assume the reverse direction
has the same stops or ordering. No direction/description fields are needed yet.
`stopIds` and `vehicleTypes` are readonly arrays to prevent accidental in-place
changes. Array ordering is preserved; no graph or routing behavior is implemented.

Provenance can be attached independently to stops, operators, and routes. Omit
`source` when provenance is unknown; when provided, `sourceName` is required.
`verifiedOn` is a calendar-date string in ISO `YYYY-MM-DD` format and must be
omitted unless verification genuinely occurred. A source URL or a declared type
does not establish verification. Use `notes` to describe accuracy or limitations;
sample datasets must be explicitly labeled when introduced in Brick 6.

These are compile-time shapes, not runtime validators. They do not enforce date
validity, URL syntax, nonempty/unique IDs, coordinate bounds (latitude -90 to 90,
longitude -180 to 180), stop counts, or referential integrity. Validate such rules
at data ingestion boundaries when those exist. No external data input is present
in this brick, so no validator or schema library is introduced.

Future website TypeScript code can use equivalent types, and Laravel can use
equivalent documented contracts: string IDs and union values, named numeric
coordinates, ordered arrays, and optional metadata/date fields. API field naming,
missing versus null semantics, storage constraints, and serialization details
remain decisions for their approved bricks; this is not an API or database schema.

`scripts/transport.type-test.ts` checks supported unions, rejected unsupported
values, numeric coordinates, string references, optional metadata, and readonly
route ordering via `tsc --noEmit`. It has no real transport records and must never
be executed as a runtime test.

## Sample Dataset (Brick 6)

Development records live in `src/features/transport/data/sampleStops.ts`,
`sampleOperators.ts`, and `sampleRoutes.ts`. Each collection uses `as const
satisfies readonly ...[]` with the existing Brick 5 types. The shared provenance
in `sampleSource.ts` explicitly describes fictional development fixtures, not
verified transport information. Every ID starts with `sample-` and every public
name starts with `Sample ` to preserve that distinction even outside the files.

The dataset contains five stops (one terminal, one bus stop, one jeepney stop,
and two train stations), three operators, and three routes (bus, jeepney, train).
All names and connections are fictional Philippine-style examples. There are
no real GMA-to-PITX claims, exact boarding addresses, coordinates, schedules,
fare amounts, source URLs, or verification dates. These records must not be used
for travel planning. They are neither verified records nor reports of real
services awaiting verification.

The files are declarative. Brick 7 imports `sampleStops` directly in Search,
and Brick 10 imports stops/operators/routes into Home, with visible fictional-data
labeling. The type-only transport index stays type-only. Nearby and Saved do not
consume the dataset. Real records
should remain separate from fictional fixtures.

`npm run check:sample-data` checks unique nonempty IDs, valid operator/stop
references, explicit stop sequences without duplicate IDs, matching operator
vehicle types, and fictional provenance without verification claims. TypeScript
checks model conformance; test-time transpilation alone does not check types.
These are dataset tests, not a runtime ingestion-validation layer.

For future real records, cite the operator or responsible transport authority's
published source (name and URL when available), verify the actual stops, travel
order, direction, and operator assignment, and record `verifiedOn` as
`YYYY-MM-DD` only when verification occurred. Document uncertainty and source
limitations in `notes`, and omit unsupported details. A fictional fixture must
never gain a verification date simply because its internal references pass tests.

## Stop and Terminal Search (Brick 7)

`src/features/transport/searchStops.ts` is the Brick 7 framework-independent
search function. It accepts a query, a readonly stop collection, and an optional
`StopType`. It trims query edges, compares names and optional addresses with
case-insensitive substring matching, and preserves input order. Empty or
whitespace-only queries return all eligible stops; no matches return an empty
array. Type filtering and text matching must both pass. The function returns
a new array without modifying the collection; it does not clone stop records.
There is no proximity, fuzzy matching, ranking, or route discovery.

`SearchScreen.tsx` uses local query/filter state, the existing `sampleStops`, and
this function. Empty queries show all five sample stops. A native Switch filters
to transport terminals; the function also supports the other model stop types
for future callers. Clear search resets the query while retaining the terminal
filter. Results show names, readable types, and addresses only when supplied.
The current dataset has no addresses; address matching is covered with a
fictional test-only fixture, not invented boarding details in the application.

Search uses a keyboard-aware `FlatList` with a scrollable header, existing
safe-area ownership, token-based styles, persistent fictional-data warning,
and a clear empty-results message. All record names retain their `Sample ` prefix
even when the header scrolls away. Results are informational rows without detail
navigation, saving, fares, schedules, or maps. Home, Nearby, and Saved are unchanged.

`npm run check:stop-search` covers case sensitivity, partial names, query
whitespace, optional addresses, empty queries, no results, each type filter,
combined filtering, and unchanged input ordering. Navigation tests check actual
Search control callbacks, clearing, terminal filtering, and sample labels using
the existing native-host/hook stubs. Device rendering and keyboard measurements
still require physical-device verification. No dependency or model change was needed.

## Configurable Fare Rules (Brick 8)

Fare-rule contracts live in `src/features/fares/types.ts`, with type exports
in `src/features/fares/index.ts`. Import models with `import type`. Rules are configurable
because an operator's fare structure and effective dates can differ from another
operator's; no universal rate or current fare is hardcoded. Brick 8 defines data
only. Calculation, estimates, and discounts belong to Brick 9.

`FareRule` contains a stable string `id`, `name`, existing `VehicleType`, optional
`operatorId`, explicit `currency: 'PHP'`, a discriminated `structure`, and
`provenance`. If `operatorId` is present it scopes the rule to that operator and
vehicle type; otherwise it describes a vehicle-mode rule. Operator precedence
and choosing among overlapping rules are not implemented. Optional inclusive
`effectiveFrom` and `effectiveUntil` are ISO `YYYY-MM-DD` date strings. PHP is the
only supported currency; callers explicitly set it, rather than relying on a
runtime default. No contract is an assertion that every operator has a rule.

| Structure discriminator | Configuration |
| --- | --- |
| `fixed` | `amountCentavos` for an eligible journey |
| `distance_based` | `baseFareCentavos`, `includedDistanceKm`, optional `minimumFareCentavos`, and an increment |
| `station_pair` | Readonly `fares` of `originStopId`, `destinationStopId`, `amountCentavos` |
| `unconfigured` | No amount or pricing configuration |

Amounts are specified in integer centavos, distances in kilometers. Distance
increments configure `distanceKm`, `amountCentavos`, and explicit `rounding`
(`up`, `down`, or `nearest`, with half increments rounded up). They describe
charges beyond the base included distance; a supplied minimum is the fare floor.
The representation supports increments, not separate distance-band tables.
Station pairs are directed: a reverse pair must be configured explicitly, and
a missing pair is unknown, not zero or an automatically inferred price. No code
in this brick applies these conventions or calculates any amount.

`FareProvenance` adds a `reliability` discriminator while reusing the existing
`TransportDataSource` fields. `verified` requires a source with `verifiedOn`;
`estimated` and `unverified` permit absent sources when unavailable. Source notes
describe conditions or limitations, and source URLs remain optional. A verified
label requires genuine evidence, not merely a type-checking object. Without
trustworthy amounts, represent the rule as unconfigured/unverified instead of
inventing prices. No sample fare records or numeric fare examples are added.

`scripts/fares.type-test.ts` is compile-only, like the existing transport type
checks. It tests structure narrowing, required configuration, price-free
unconfigured rules, source/date requirements for verified status, and readonly
station-pair tables. Numeric fields use declared variables, not invented fares.

Types alone cannot validate arbitrary runtime input, finite/nonnegative safe integer
amounts, positive increments, date validity/order, operator/station references,
duplicate station pairs, or nonempty tables. Brick 9 validates the fields used
by its calculator without introducing a validation framework. Source authenticity
and ID reference integrity remain ingestion responsibilities. Limits, rounding
conventions, and rate-selection
policy must be checked against actual sources before configuring production rules.
UI, transport models/dataset, dependencies, and current application behavior
remain unchanged.

## Fare Calculation Engine (Brick 9)

`src/features/fares/calculateFare.ts` implements the pure synchronous
`calculateFare(rule, journey, discount?)` function, exported by the fare index.
Its input/result contracts live in `calculationTypes.ts`. It never reads a clock,
dataset, network, UI state, or database, and does not mutate inputs. The caller
supplies one explicit rule; selecting rates, discovering routes, and aggregating
transfers are not implemented. Existing Brick 8 rule shapes are unchanged.

`FareJourney` supplies a vehicle type and optional operator, distance, station
IDs, and calendar date. Rule applicability checks vehicle/operator and inclusive
effective-date limits. A bounded rule requires a journey date. Fixed fares return
their amount; distance fares add rounded increments only beyond included distance
and apply a regular-fare minimum floor. Exact boundaries add no extra increment.
Station-pair lookup is directed, never symmetric or interpolated. A missing pair,
unconfigured structure, or inapplicable rule returns `unknown` without an amount.
An explicitly configured zero is distinguishable from an unknown fare.

`FareCalculationResult.status` distinguishes `regular`, `discounted`, `unknown`,
`invalid_journey`, and `invalid_configuration`. Successful results include PHP,
integer centavos, the regular amount, and rule provenance. Invalid results carry
a message and no price. Invalid configuration is checked before applicability
or journey calculation. Validation covers nonnegative safe-integer money,
finite/nonnegative distances, positive increments, supported rounding, nonempty
station tables, duplicate directed pairs, calendar dates/date ordering, essential
IDs, provenance shape, and discount rates/conditions. Computed regular fares
beyond the safe-integer limit return invalid configuration instead of losing
precision. The engine cannot establish whether referenced operators/stations
exist or whether a source is authoritative.

`DiscountPolicy` supplies a stable ID/name, integer `rateBasisPoints` from 0 to
10,000, payable-fare rounding, vehicle/operator conditions, and existing fare
provenance. No percentage or eligibility rule is built in. The caller requests
a discount and explicitly supplies `eligible: true`. Applying it additionally
requires structurally verified policy provenance and matching conditions.
False eligibility produces regular fare with `not_eligible`. Unknown eligibility,
absent policy, unverified/estimated policy, or unmet conditions retains regular
fare with a specific `unavailable` reason. A malformed supplied policy returns
invalid configuration, even if the passenger is not eligible. Metadata does not
prove source authenticity: callers must genuinely verify a policy before marking
it verified. The engine does not perform eligibility verification or source research.

Money is represented as integer centavos. BigInt intermediates prevent monetary
overflow/float rounding during multiplication. Rates use a 10,000 denominator.
`up`, `down`, and `nearest` (half-up) apply to distance increment counts and to
the final discounted payable amount; the discount amount is the regular amount
minus that rounded payable amount. The regular minimum is applied before the
discount, not re-applied afterwards. Post-discount floors are not part of the
current policy contract. Discount amounts are never compounded or stacked.

For distance boundaries, decimal representations of the supplied numbers
(including scientific notation) are converted to exact BigInt fractions before
subtracting/dividing. This avoids binary subtraction errors for decimal inputs
such as 0.3 and 0.1. Upstream arithmetic errors already embedded in an input
number are not silently normalized with a tolerance. An ES2020/BigInt-capable
runtime is required. Only safe integer numeric centavos leave the engine.

`npm run check:fares` covers all four structures, applicability, boundaries,
minimums, directionality, unknown fares, eligibility, policy conditions, rounding,
large-money precision, invalid inputs/configurations, overflow, determinism, and
unchanged inputs. All monetary examples and the simulated verified policy are
synthetic test fixtures, not official fares; no production fare records are added.
There are no new UI screens, navigation changes, dependencies, APIs, or discounts
connected to the application in this brick.

## Direct Route Finding (Brick 10)

`src/features/routes/findDirectRoutes.ts` accepts origin/destination IDs, routes,
stops, and operators. It returns `DirectRouteResult[]` with route identity/name,
vehicle type, operator, endpoints, the inclusive ordered journey segment, and
existing route provenance. Stop/operator details are references to supplied
records, not copies of the entire dataset. Stop/operator provenance remains on
those records. There is no fare-engine dependency or calculation in this feature.

A route matches only when both IDs occur in its configured `stopIds` with origin
before destination. Results preserve first route occurrence order. Unknown IDs,
identical endpoints, and no matches return an empty array. No reverse service,
geographic connection, transfer, schedule, or duration is inferred.

The whole route is checked, not merely its returned segment: missing/ambiguous
stop or operator IDs, unnamed records, unsupported stop/vehicle types, repeated
stop IDs, malformed sequences, or incompatible operator modes exclude it.
Repeated identical serialized route records collapse to one result. Conflicting
records sharing a route ID are excluded entirely, as are duplicate stop/operator
IDs. Loop services are not supported by the current simple direction contract.
The supplied records remain unchanged; callers should treat result references
as read-only. This is focused integrity handling, not a generic external-data parser.

`src/features/routes/resolveStop.ts` reuses stop search for entered names/addresses.
It prefers a case-insensitive, trimmed exact name over partial matches. Otherwise
only a unique partial match resolves. Missing, duplicate-name, or multi-match
inputs explicitly fail; no first match is chosen arbitrarily.

Home passes the existing sample collections to its local form reducer on submit.
The reducer resolves both stops, calls the pure finder, and stores results plus
accessible feedback. Invalid/ambiguous names request a valid name from Search;
same-stop journeys are explicitly rejected. Empty matches clearly state that no
direct sample route connects the stops in that direction. Editing/swapping clears
old results. Placeholders now use actual fictional sample names instead of real
locations not in the dataset. A fictional-data notice remains visible in the
form and sample names remain on all result rows. No stop-picker redesign or
additional navigation is introduced.

Results use existing tokens and the existing scrollable, keyboard-aware safe-area
layout. They show only route name, operator, mode, and ordered stop names.
For a manual test, enter `Sample Bayan Terminal` then `Sample Palengke Bus Stop`:
one fictional sample bus route should appear. Swapping produces the explicit
no-direct-route state. `Sample` is ambiguous and must not resolve arbitrarily.
No transfers, fare estimates, real-world recommendations, or new dataset records
are introduced. Search, Nearby, Saved, fare contracts, and the calculator are unchanged.

`npm run check:direct-routes` covers valid/reference-invalid routes, ordering,
reverse direction, unknown endpoints, multiple results, intermediate stops,
duplicates, deterministic output, unchanged inputs, and ambiguous name resolution.
Form and navigation checks cover result integration and empty/error states.
Native keyboard, focus, visual layout, and announcements still require device
verification; UI checks use the established host/hook stubs.

## Transfers and Fare Estimates (Brick 11)

Brick 11 supersedes Home's direct-only result state described above; the pure
Brick 10 direct-route API remains unchanged and is reused for segment validation.

`src/features/routes/findJourneys.ts` is a pure synchronous planner. It accepts
the origin/destination IDs, supplied route/stop/operator collections, and optional
`JourneyPlannerOptions`. Directed segments are obtained through the Brick 10
finder for each ordered stop pair, preserving its whole-route integrity checks,
provenance, endpoints, and relevant stop sequence. Segments extend that result
shape with their fare result. Transfers connect only identical configured stop
IDs; no geographic, name-based, or walking interchange is inferred.

Search enumerates directed paths with `maxSegments` defaulting to 3 (two transfers)
and an allowed range of 1 through 6. Invalid limits throw a `RangeError`, rather
than being silently clamped. Used route IDs and visited stops (including intermediate
stops) prevent repeated routes and cycles; a transfer's shared boarding stop is
allowed once between legs. Paths do not pass the destination and return later.
Duplicate route/boarding/alighting sequences are suppressed. Results sort by
segment count, then stable discovery order from the input stops/routes. This
prefers fewer transfers, not global fastest/cheapest service. Construction and
enumeration are intentionally suited to a small static dataset; no production
scale or shortest-path guarantee is claimed.

`JourneyResult` contains endpoint references, ordered `JourneySegment` records,
transfer-stop references, transfer count, and a discriminated fare estimate.
Direct journeys have one segment and zero transfers, using the same underlying
record shape as Brick 10. The result references existing transport records rather
than copying the entire database. Treat returned records as read-only.

The fare contracts do not encode a unique route-to-rule mapping. To avoid guessing,
`fareInputs` explicitly bind one supplied fare rule to an exact route ID plus
boarding/alighting stop IDs. Zero matches mean `missing_rule`; multiple matches
mean `ambiguous_rule`, even if prices happen to agree. There is no implicit
operator-wide default, whole-route-to-subsegment prorating, or rate precedence.
Callers must establish the correct assignment from reliable configuration. This
is a deliberate limitation, not inferred real-world fare knowledge.

Each unique binding calls the existing Brick 9 calculator with the segment's
vehicle, operator, boarding and alighting IDs, and explicitly supplied distance,
date, and discount request. No distance is calculated from stop coordinates.
Distance-dependent fares without distance or date-bounded rules without a date
remain uncalculable through the calculator's existing invalid-journey status.
Missing station pairs, mismatched rules, malformed rules, and unconfigured fares
retain their exact result. Discounts require the same supplied policy, conditions,
verified policy metadata, and explicit eligibility as Brick 9; no automatic
transfer discount or free second boarding is introduced.

Complete totals sum already-rounded segment centavos with BigInt, then convert
to a number only within the safe-integer limit. A configured zero remains valid.
If no leg is calculated, the total is `unknown`; some but not all legs calculated
produces `incomplete` with known/total segment counts. Neither status contains
a total or partial sum. Sum overflow is `unknown` with `total_overflow`. All
segments retain their own fare outcome/provenance, and complete fare reliability
is the weakest of the contributing fare/policy sources: unverified, then estimated,
then verified. This is fare provenance only, not proof of route/service availability.
Regular fallback fares retain their calculator discount-unavailability reasons.

Home's local reducer now stores journeys rather than direct route results. It
retains unambiguous stop resolution and the existing sample-data warning. The UI
shows each ordered segment, boarding/alighting sequence, transfer stop, transfer
count, segment fare status, and a total only when complete. Monetary display splits
integer-centavo digits rather than floating-point division. Incomplete/unknown
labels never display a misleading partial total. Editing/swapping clears results.
Search, Nearby, Saved, transport records, and the prior fare/direct-route functions
remain unchanged.

No sample fares are configured, so Home's current journeys all show unknown
totals. A manual transfer example is `Sample Plaza Jeepney Stop` to
`Sample Palengke Bus Stop`, changing at `Sample Bayan Terminal`. These are fictional
development records, not commuter recommendations. Multi-transfer and numerical
fare cases are synthetic test fixtures only, not new application data.

`npm run check:journeys` covers directions, shared IDs, limits, invalid references,
cycles, deduplication/order, complete/incomplete/unknown totals, explicit bindings,
distance/date requirements, station pairs, discounts, overflow, provenance, and
unchanged inputs. Form and existing UI-stub tests verify transfer and total labels.
Native device layout, keyboard behavior, and announcements remain unverified.

## Maps and Walking Directions (Brick 12)

Brick 12 uses the authorized external-map fallback, not an embedded native map.
`SearchScreen.tsx` offers location details for each stop by stable ID through the
focused `StopMapDetails.tsx` section. Names, readable types, and optional addresses
remain on the selected row; source descriptions and notes appear in its details.
The Home tab remains the way back to route search. Nearby is still a placeholder:
no location permissions or proximity detection have been introduced.

The actual project uses Expo SDK 57, React Native 0.86.3, and React Navigation.
[Expo's SDK 57 map documentation](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/)
lists `react-native-maps` 1.27.2 as included in Expo Go, with no extra Go setup.
It is not inherently incompatible with this project. Standalone Google Maps
binaries, however, require provider key/configuration and rebuilding. This
repository has no mapping configuration, all five sample stops lack coordinates,
and native rendering cannot be verified in the current environment. The fallback
avoids adding an unverified embedded-map integration and deployment setup for an
empty location dataset. It preserves Expo Go and adds no dependency, key, paid
service, development-build requirement, or native project changes. An embedded
map can be considered separately when sourced locations and device verification
are available; this brick makes no claim to render native markers.

Pure helpers live in `src/features/transport/mapStops.ts`. `hasValidCoordinates`
accepts only finite numeric latitude in [-90, 90] and longitude in [-180, 180],
including boundary values and zero. `getMapStops` preserves configured record
order, excludes missing/invalid coordinates, collapses identical repeated IDs,
and excludes conflicting repeated identities. `selectStopById` uses exact IDs,
not names or indexes; it also permits selection of coordinate-free stops so the
UI can explain unavailability. Inputs are not mutated. These helpers are
framework-independent and use existing transport models.

`stopMapUrl` constructs a Google Maps coordinate-search URL; `stopWalkingUrl`
constructs a destination-only directions URL with `travelmode=walking`. Both
validate coordinates again and encode the numeric coordinate pair. No stop name
is geocoded, and invalid locations produce no URL. The external provider lets
the user choose an origin, or may use a location available to that provider;
Komyut neither requests GPS nor supplies an invented origin. Walking coverage,
path safety, and actual service availability are not guaranteed by numeric
coordinate validity. See [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

User-initiated actions are explicitly labeled as opening outside Komyut.
[React Native Linking](https://reactnative.dev/docs/linking) opens the HTTPS URL
in the installed handler or browser; failures show an accessible error with retry
available through the same action. No custom URL scheme or manifest permission
is needed. Network and provider availability affect the external experience.

The current fictional dataset is unchanged: there are no coordinates to open.
Search shows a clear empty-coordinate message, and each stop's details explain
that map/walking directions are unavailable. Source notes continue to identify
fictional fixtures. Coordinate test cases are synthetic test-only records, not
new boarding locations. No transport geometry, paths, distances, ETAs, automatic
walking transfers, or fare changes are inferred. Integration is through stop
details; journey results and their planner remain unchanged.

`npm run check:maps` covers coordinate validity/bounds, identity deduplication,
selection, encoding, missing locations, and both URL forms. Navigation tests
cover detail selection, unavailable states, mocked external opening and failure
feedback. Hosts/hooks/Linking are stubbed: passing tests and Android/iOS bundles
do not verify native layout, screen-reader behavior, or actual external launching.

## Laravel API Foundation (Brick 13)

`apps/api/` is a separate API-only Laravel application with its own Composer
manifest/lockfile, environment template, PHPUnit tests, and development rules.
The mobile application's Expo configuration, dependencies, transport models,
fare engine, route planner, and sample dataset are unchanged. No root workspace
package or shared PHP/TypeScript layer is introduced. The future Next.js website
and admin interface will consume approved API contracts; neither exists yet.

The available tooling is PHP 8.2.12 and Composer 2.8.11. Laravel 12.69.3 is locked,
because Laravel 13 requires PHP 8.3+. Laravel 12 is supported for security fixes
until February 24, 2027, with bug fixes having ended August 13, 2026. This is an
explicit compatibility trade-off, not a claim that it is the newest major release.
Use an up-to-date PHP patch release and plan a separately authorized runtime and
framework upgrade before security support ends. Reference:
[Laravel support policy](https://laravel.com/docs/13.x/releases).

The skeleton was generated with Composer's `create-project` and `--no-scripts`
to prevent the stock SQLite creation/migration hooks. Default user scaffolding,
migrations, the welcome page, Vite/npm assets, and unused Sail/Pail/Faker packages
were removed from this newly generated application. Setup does not migrate or
create any database, and no Docker/authentication infrastructure was installed.
Standard framework configuration files are retained; unused authentication and
database driver defaults are not implemented services.

`bootstrap/app.php` registers `routes/api.php` with Laravel's supported
`withRouting(api: ...)` option. Routes receive the standard stateless `api`
middleware and `/api` prefix. `install:api` was deliberately not run because it
adds Sanctum. No middleware protection or CSRF configuration was disabled.
Reference: [Laravel API routing](https://laravel.com/docs/12.x/routing).

Unused local-file download/upload routes are disabled in `config/filesystems.php`.
The sole application HTTP route is `GET /api/health` (also supports standard HEAD).
It returns HTTP 200 and exactly `{"service":"komyut-api","status":"ok"}` as
JSON. It reports application liveness only: it does not inspect a database,
external services, fare configuration, transport availability, or passenger data.
No environment contents, application key, internal paths, or diagnostics are
included. API errors use JSON even when clients omit the Accept header; with
debug off, framework production responses omit internal exception details.

Environment configuration follows Laravel conventions. `.env.example` contains
empty secret placeholders and conservative local defaults: `APP_DEBUG=false`,
file cache/session storage, sync queue, and loopback URL. `DB_CONNECTION` is
deliberately `unconfigured`, so accidental database access fails instead of
silently creating storage. `.env` and its local variants are ignored, while the
safe template is included. A private local key was generated without publishing
its value. Future production configuration must independently provide
`APP_ENV=production`, `APP_DEBUG=false`, its private key, HTTPS URL, and logging
settings; production hosting/automation remains deferred. Never commit real
environment files. See [Laravel configuration](https://laravel.com/docs/12.x/configuration).

`tests/Feature/HealthTest.php` uses Laravel's bundled PHPUnit tooling. It asserts
the exact JSON/status/content type with database connection calls forbidden,
checks 405/404 API responses, and checks that a synthetic production-mode failure
returns only a generic 500 JSON message. No database refresh trait or migration
is used. Windows setup and all backend check commands are in `apps/api/README.md`.
The CLI, tests, and real loopback HTTP request have been verified; no deployed
server or mobile-to-API connection is claimed. PostgreSQL schema/driver setup and
data persistence belong to Brick 14; client integration belongs to Brick 15.

## PostgreSQL Schema (Brick 14)

Brick 14 supersedes Brick 13's database-placeholder state. The one reversible
migration `2026_10_12_000000_create_transport_schema.php` defines seven tables;
it has not been executed on a PostgreSQL instance in this environment. Laravel
12.69.3/PHP 8.2.12 are unchanged. No transport endpoint, ingestion, seed data,
calculation service, mobile integration, or website is added.

| Table | Purpose and relationships |
| --- | --- |
| `transport_stops` | String ID/name/type; optional paired coordinates/address; source fields and timestamps |
| `transport_operators` | String ID/name; source fields and timestamps |
| `operator_vehicle_types` | Operator FK plus one closed-set vehicle type per row; unique operator/type pair |
| `transport_routes` | String ID/name, required operator FK and vehicle type; source fields and timestamps |
| `route_stops` | Route/stop FKs and nonnegative position; unique route/position and route/stop |
| `fare_rules` | String ID/name, optional operator FK, vehicle type, PHP currency, variant fields, provenance, effective dates and timestamps |
| `fare_station_pairs` | Fare-rule FK, origin/destination stop FKs, exact centavos; unique directed rule/origin/destination triple |

Domain IDs are opaque `varchar(64)` primary keys, not generated numeric IDs or
names. Models declare non-incrementing string keys. Three junction/detail tables
have internal bigint surrogate IDs for ordinary Eloquent record operations;
their business identities also have unique constraints. No API ID serialization
contract is introduced. Names are required `varchar(255)`, IDs/names must be
nonblank. Stop types and vehicle types match existing TypeScript unions, enforced
with varchar/CHECK rather than a new catalog or native enum.

Coordinates are either both null or both present. Double precision is used for
coordinates only, with latitude [-90, 90] and longitude [-180, 180] checks. Money
never uses floating point. Missing coordinates remain valid; nothing is geocoded.
The optional `vehicleTypes` list is normalized into child rows, not a delimited
string. Zero rows mean unspecified modes; the omitted-versus-explicit-empty-array
distinction is not stored. A future importer must define/reject explicit empty
mode lists and check compatibility when modes are declared. Route mode membership
is not inferred or enforced across the optional collection by a trigger.

Routes represent one configured travel direction. `route_stops.position` is a
zero-based nonnegative integer; positions are unique per route, need not be
contiguous, and are read in ascending order. Unique route/stop matches the existing
finder's no-repeated-stop contract: loop services remain unsupported. Future
authoring must validate that a published route has enough stops; there is no
cardinality trigger. `TransportRoute::stops()` orders its pivot positions and
`routeStops()` orders the explicit child records. The other simple Eloquent
models expose operator, route, stop, fare-rule, and directed-pair relationships.
They do not discover routes, apply discounts, or calculate fares.

All eight foreign keys restrict both delete and referenced-ID update. No dataset
rows cascade away. Removing referenced data requires explicit child-record
changes in a future authorized workflow. Unique constraints support route order,
route membership, operator modes, and fare-pair lookup. Additional indexes cover
stop type, route operator/mode, reverse stop membership, fare operator/mode and
mode-only lookup, and station-pair stop references. FK child indexes are explicit
because PostgreSQL does not automatically create them. No speculative substring,
spatial, or source-metadata indexing/extension is introduced.

### Fare Storage

Fare variants use relational columns, **not JSONB**, avoiding opaque monetary
values and unenforceable station references inside JSON. `structure_type` retains
the existing `fixed`, `distance_based`, `station_pair`, and `unconfigured` values.

- Fixed: only `amount_centavos` is present among scalar pricing fields.
- Distance-based: `base_fare_centavos`, `included_distance_km`,
  `increment_distance_km`, `increment_amount_centavos`, and `increment_rounding`
  are required; `minimum_fare_centavos` is optional. Fixed amount is null.
- Station-pair: scalar pricing fields are null; directed amounts belong to
  `fare_station_pairs`. Reverse entries must be supplied separately.
- Unconfigured: all scalar pricing fields are null. No numeric default turns an
  unknown fare into zero. A configured zero remains representable.

Each monetary field is bigint integer centavos, constrained to 0 through
9,007,199,254,740,991, matching the mobile calculator's safe-integer range. PHP
integer casts require a 64-bit runtime. Distances use exact `numeric(20,10)`:
up to ten fractional digits and a maximum 9,999,999,999.9999999999 km. Included
distance is nonnegative; increments must be positive. Eloquent returns distances
as decimal strings, never monetary floats. This is a persistence precision limit,
not a change to the TypeScript calculator: a future application boundary must
reject out-of-range/excess-precision input before PostgreSQL could round it.
Rounding values retain `up`, `down`, and `nearest`; no rounding/math is executed
by this schema.

Variant-specific nullability is enforced by a CHECK. Cross-table business rules
remain boundary responsibilities: pair rows must belong only to station-pair
rules, those rules must have nonempty tables, and fixed/unconfigured rules must
have no pair rows. These are not enforced by a trigger. Effective date order is
checked when both dates exist; overlapping rules, applicability, choosing rates,
passenger eligibility, explicit route-to-rule bindings, and discounts remain
outside schema/model behavior. No route/fare-binding or discount-policy table
is invented where the current persistent contract does not require one.

### Provenance and Configuration

Stops, operators, routes, and fare rules store the same atomic source fields:
`source_name`, optional `source_url`, `verified_on`, and `source_notes`. With no
source name, the other source fields must also be null. A present name must be
nonblank. Fare rules additionally require `reliability` as verified, estimated,
or unverified. Verified requires both a source name and verification date; that
constraint does not prove authenticity. Source URLs and genuine verification
must be checked by future authoring/import code, never inferred from passing
tests or a date column. No mobile fictional fixture is copied into the database.

Verification/effective fields use SQL DATE and Eloquent `date:Y-m-d` casts.
Application boundaries must accept valid finite ISO `YYYY-MM-DD` calendar dates
and validate URLs and referenced data before persistence; casts are not validators.
Entity timestamps use PostgreSQL timezone-aware timestamps. There are no JSONB
fields to cast in this design, and no special PostgreSQL extensions are required.

The PostgreSQL connection is selected through environment variables. The safe
template uses loopback host/port, `komyut_local`, empty username/password, optional
`DB_SCHEMA` (default public), and `DB_SSLMODE` (prefer for local development).
The existing private `.env` has been preserved and may still say unconfigured.
PHP's `pdo_pgsql` must be available before any connection is attempted. Never
substitute SQLite/MySQL; the migration refuses other drivers. Health stays
database-independent, and no normal syntax/style test requires a database.
Setup and explicit local-only migration instructions live in `apps/api/README.md`.

### Verification Limits

Database-free tests compile up/down SQL using the real PostgreSQL grammar in
pretend mode, with a PDO callback that fails on any connection attempt. They
inspect required definitions and test Eloquent relationship keys, ordered SQL,
string IDs, decimal/integer/date casts, unknown amounts, and non-PostgreSQL refusal.
They **do not verify SQL acceptance, constraint enforcement, or persistence**.

Live tests require `pdo_pgsql`, explicit `KOMYUT_PG_TESTS=1`, and a dedicated local
`komyut_brick14_test` database on loopback port 5432. They use private test-role
environment variables rather than inheriting the app connection. A unique schema
is created within each transaction; its isolated search path prevents access to
existing schema tables, and rollback removes only test objects/fixtures. There
is no production migration, reset/fresh operation, or destructive action against
existing data. These tests cover native constraints, ordering, references,
deletion/update restrictions, unknown fares, exact money/distances, and provenance.

On this workstation, PHP lacks `pdo_pgsql`; no PostgreSQL client/service was
discovered during inspection. No live connection or migration was attempted.
Thirteen database-independent tests passed (94 assertions); all 22 native tests
were explicitly skipped. Real migration execution/reversal, foreign-key/check
enforcement, index creation, and native data round trips remain unverified.
Mobile remains unchanged. Live verification must precede reliance on this schema
in a real environment; completion here is the permitted definition-only path.

## Mobile API Connection (Brick 15)

The Expo SDK 57/React Navigation architecture and Laravel 12 schema are retained.
`TransportController` adds `/api/stops` and `/api/routes`; `/api/health` retains
its exact original JSON. Lists use `{ data: [...], meta: { limit, hasMore } }`
and the existing TypeScript stop/route/source fields in camelCase. IDs are stable
database strings; routes include stopIds in configured position order. Optional
coordinates/addresses/source fields are omitted when absent. Explicit field
whitelists prevent full-model/private configuration serialization.

Limit is an integer 1 through 100, default 50; an extra row detects hasMore and
is omitted. Parent records order by ID. Stop q is trimmed and capped at 120
characters; PostgreSQL ILIKE uses bound, literal substring matching over name
and address, escaping pattern characters. Optional type uses the existing union.
Route-stop rows are eagerly loaded with necessary columns and their ordered
relationship, avoiding N+1 queries. Child sequences are complete. There is no
cursor, operator/fare endpoint, write operation, seed data, or calculation logic.
Invalid parameters use Laravel's normal 422 validation JSON. Database failures
return only a generic 503 code/message; details stay in private logs.

### Mobile Integration

`apps/mobile/src/api/transportApi.ts` reads
`process.env.EXPO_PUBLIC_API_BASE_URL` using Expo's static environment inlining.
The new safe `.env.example` is empty by default; local variants are ignored.
The public URL must include /api and be reachable from the device. No localhost
address is hardcoded in application logic. Credentials, query strings, fragments,
relative URLs and non-HTTP(S) schemes are rejected. EXPO_PUBLIC values ship in
the app: never place passwords/keys/tokens there. See
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

The client reuses domain models, adding only list/error types. fetchStops and
fetchRoutes parse unknown JSON, validate envelope bounds/field shapes/unions,
reject duplicate IDs and invalid coordinates/dates/repeated route stops, and
retain source metadata without asserting authenticity. It cannot prove complete
cross-list reference integrity or service availability. Nothing missing is
invented. HTTP/network/configuration/timeout/cancel/response errors are typed and
safe. A 10-second deadline covers fetch and JSON decoding, settling even if a
transport ignores abort. SDK 57's installed Expo runtime supplies URL globals;
native fetch/abort primitives need no new dependency or native configuration.

`src/api/useApiStops.ts` owns request state; Search keeps presentation and its
existing query/type controls. Sample mode remains default with zero requests.
Load API stops opts in. Queries are debounced 300 ms; query/type changes, sample
switching and unmount cancel/ignore stale work. Ordinary rerenders do not refetch.
Retry repeats a failed request. Loading/errors visibly retain labeled fictional
samples; successful empty API lists remain empty. Use sample stops explicitly
returns to local search. API successes have a distinct non-verified source notice
and hasMore guidance. Styling, safe areas, keyboard/scroll behavior, clear/type
filters and existing location details are retained.

Home still plans only fictional samples. The route-fetch client is implemented
and tested but not wired to Home: the API does not provide its complete operator/
stop graph or fare bindings. Partial API records are not mixed with fictional
operators or prices. No new planning, fare logic, GPS, maps, navigation, cloud
sync, global store or persistent source preference is introduced. Nearby/Saved
and all existing domain logic remain unchanged.

### Verification

Node tests cover parsing, errors, deadline/cancel behavior, controlled request
lifecycle and UI source states. Hosts/hooks/timers are stubbed where appropriate,
not device tests. Laravel contract tests mock fetching while compiling real
PostgreSQL query grammar; no SQLite substitution is used. Actual results:
121 mobile tests and TypeScript passed; 21 Laravel tests passed (135 assertions),
with all 25 native PostgreSQL tests skipped because pdo_pgsql is unavailable.
PHP syntax, Pint and Composer validation passed. Real loopback HTTP verified
health 200, transport 503 and invalid limit 422; the actual typed Node client
also reported HTTP/503 from Laravel. Android/iOS bundles returned HTTP 200.
Successful database-backed fetching and physical-device behavior remain unverified.

Expo compatibility check exits 1 recommending 57.0.28 over installed 57.0.27;
dependencies were not updated for this unrelated patch warning. Mobile lint
remains unconfigured. Existing environment credentials were not changed; no
migration was executed and verification servers were stopped. Brick 16 is pending.

## Supplemental Rail Import

The phase-one TrainsPh importer uses `apps/api/app/Services/TrainsPh/` and the
`transport:import-trainsph` Artisan command. Original hash-verified snapshots
live in `apps/api/database/data/trainsph/2026-10-07/`; its README records CC BY 4.0
attribution, source claims and explicit mappings. The manifest is independently
pinned in code. No live downloads occur during database operations.

Only stations, operators/train associations and canonical ascending-order routes
are projected into the existing schema. No schema change, inferred reverse route,
fare activation, interchange graph or mobile modification is introduced. Native
source station IDs are retained. Source verification claims are recorded in notes;
the existing independent `verified_on` field remains null.

Preview defaults to read/compare only. Apply requires an exact database-name
confirmation and the reviewed local loopback PostgreSQL target. Ownership markers,
a transaction-scoped advisory lock, apply-time table locks and conflict preflight
protect unrelated records. Identical reimports do not rewrite rows; changed owned
route sequences are replaced inside the transaction. Removed stops are retained.

The real development database now supports a successful preview, but no apply
was executed here. Dedicated PostgreSQL transaction tests are explicit opt-in
and currently blocked by unconfirmed test database/role and absent credentials.
Transactional correctness is not claimed from parsing/mock tests alone. The
public website remains deferred; this supplemental task does not complete the
roadmap's original Next.js Brick 16.

## Local-First Rail Data - Task 1

`apps/mobile/src/features/rail/` provides an independently testable pure
TypeScript rail module and unchanged bundled TrainsPh snapshots. It is separate
from fictional samples and the existing Laravel API client; no PostgreSQL,
network, storage or UI integration is required or introduced in Task 1.
See its README for attribution, validation, integrity checks and public API.

Station/operator projections reuse transport types. Same-line ticket bases use
LRT stored-value matrices with explicit PHP 5 Single Journey rounding, or MRT
station-ordinal bands. Reverse price lookup does not infer directional routes.
Dates/provenance are explicit and source verification claims are not promoted
to independent Komyut verification. Stale claims are labeled. Results have only
baseFareCentavos; currentlyPayableCentavos remains null. Applicable source
modifiers are exposed, never activated as unverified discount policies.

Baseline original-byte hashing is verified in Node tests; runtime structural
validation is deliberately separate. The later caching/refresh task must verify
downloaded original bytes before accepting parsed data. That task, additional
fare-policy behavior, and UI integration each require separate approval.
No existing backend, importer, generic fare engine or screen behavior changes.

## Local-First Rail Data - Task 2

`apps/mobile/src/features/rail/persistence/` adds injected original-byte integrity,
bounded fetch, file storage and active-data selection modules, plus SDK 57 Expo
adapters. The pure rail index/fare functions do not import native modules. Existing
screens, samples and Laravel client remain untouched; no repository is yet
instantiated by the UI. No refresh runs automatically or in the background.

Durable versions live under Paths.document/komyut-rail-v1. Each version retains
original manifest/line bytes and a separately dated receipt. Complete staged data
is verified, moved to an immutable version name, read back and validated before
activation. Startup rechecks every committed candidate and falls back to an older
valid version or the bundled baseline. No partially validated version becomes
active. Previous versions are retained; only failed owned staging is cleaned.

Requests use HTTPS, omit credentials/refuse redirects, stream within bounded sizes
and time out. Source generation, source verification and effective dates remain
separate from manifest generation and refresh time. SHA-256 checks establish only
consistency, not authenticity/fare freshness. Unverified modifiers are not applied;
currentlyPayableCentavos stays null. No PostgreSQL/importer change is involved.

All 186 mobile tests (65 focused rail) and TypeScript passed with zero skips. Expo
compatibility still recommends 57.0.28 over installed 57.0.27; no Expo upgrade was
required for the selected storage/hash APIs. Device persistence/crash behavior
remains unverified; tests use mocked network/storage and SDK-shaped adapters.
See persistence/README.md for commit semantics, commands and dependency warnings.

## Planned Boundaries

UI components will handle presentation and interaction. Business logic,
transport models, and API calls will remain separate from UI code as their
respective bricks introduce them. Fare calculation must be independent of UI
components and tested when implemented in Brick 9.

The Laravel API's read-only transport contract is connected to optional Search
requests in Brick 15; successful PostgreSQL fetching is still unverified. The Next.js public
website and the admin interface are later consumers; their implementation and
hosting details are deferred to their approved bricks.

## Data Integrity

Sample transport data must be clearly labeled. Fare rules must carry source
and verification metadata. Invented data must never be presented as verified
information. Journey planning currently uses fictional samples only; no fares
are configured in application data. Map/walking actions only use valid configured
coordinates; the current fictional dataset has none.

## Deferred Decisions

Embedded mapping, detailed schemas, API contracts,
authentication, admin technology, deployment services, monitoring, and backups
will be chosen in the relevant bricks. Avoid speculative infrastructure or
abstractions before they are needed.
