const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const React = require('react');
const ts = require('typescript');
const { TabRouter } = require('@react-navigation/routers');

const root = path.resolve(__dirname, '..');
const cache = new Map();
const formActions = [];
const searchState = [];
let searchHookIndex = 0;
let keyboardDismissed = false;
let homeState;
let homeNavigate = () => {};
let railState = { status: 'loading' };
let refreshCalls = 0;
let estimateDate = '2026-10-14';
const native = {
  Linking: { openURL: async () => {} },
  FlatList: 'FlatList',
  Keyboard: { dismiss: () => { keyboardDismissed = true; } },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Switch: 'Switch',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
};
const mocks = {
  react: {
    ...React,
    useReducer: (reducer, initialState) => [homeState ?? initialState, (action) => { formActions.push(action); if (reducer.name === 'commuteFormReducer') homeState = reducer(homeState ?? initialState, action); }],
    useRef: (value) => ({ current: value }),
    useEffect: () => {},
    useState: (initialState) => {
      const index = searchHookIndex++;
      if (!(index in searchState)) searchState[index] = initialState;
      return [searchState[index], (value) => { searchState[index] = typeof value === 'function' ? value(searchState[index]) : value; }];
    },
  },
  'react-native': native,
  'react-native-safe-area-context': {
    SafeAreaProvider: 'SafeAreaProvider',
    SafeAreaView: 'SafeAreaView',
  },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  '@react-navigation/native': {
    useNavigation: () => ({ navigate: (name) => homeNavigate(name) }),
    DefaultTheme: { dark: false, colors: {}, fonts: {} },
    NavigationContainer: 'NavigationContainer',
  },
  '@react-navigation/bottom-tabs': {
    createBottomTabNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
  },
};

// Inspect React element trees with native hosts stubbed; routing uses the real TabRouter.
// This checks event behavior and configuration, not native layout or rendering.
function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (filename === path.resolve(root, 'src/features/rail/ui/useRailData.ts')) return { useRailData: () => ({ state: railState, retry: () => {}, refresh: () => { refreshCalls++; } }) };
  if (cache.has(filename)) return cache.get(filename);
  if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename, 'utf8'));
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const result = { exports: {} };
  const localRequire = (name) => {
    if (mocks[name]) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    if (fs.existsSync(target) && path.extname(target) === '.json') return load(target);
    const extension = ['.tsx', '.ts'].find((ext) => fs.existsSync(target + ext));
    return load(target + extension);
  };
  new Function('require', 'module', 'exports', source)(localRequire, result, result.exports);
  cache.set(filename, result.exports);
  if (filename === path.resolve(root, 'src/features/rail/ui/railSelection.ts')) result.exports.railEstimateDate = () => estimateDate;
  return result.exports;
}

const { MobileNavigator } = load('src/navigation/MobileNavigator.tsx');
const { TabBar } = load('src/navigation/TabBar.tsx');
const { colors } = load('src/styles/tokens.ts');
const navigator = MobileNavigator().props.children;
const registeredScreens = React.Children.toArray(navigator.props.children);
// Retained screen/tab code has isolated regression coverage, but is not exposed by the app.
const screens = ['Home', 'Search', 'Nearby', 'Saved'].map((name) => ({ props: {
  name, component: load(`src/screens/${name}Screen.tsx`)[`${name}Screen`],
} }));
const routeNames = screens.map((screen) => screen.props.name);
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };

function findByType(element, type) {
  if (element.type === type) return element;
  for (const child of React.Children.toArray([element.props?.children, element.props?.ListHeaderComponent])) {
    if (!React.isValidElement(child)) continue;
    const match = findByType(child, type);
    if (match) return match;
  }
}

function findByProp(element, prop, value) {
  if (element.props?.[prop] === value) return element;
  for (const child of React.Children.toArray([element.props?.children, element.props?.ListHeaderComponent])) {
    if (!React.isValidElement(child)) continue;
    const match = findByProp(child, prop, value);
    if (match) return match;
  }
}

function harness() {
  const router = TabRouter({ initialRouteName: navigator.props.initialRouteName });
  let state = router.getInitialState(options);
  const events = [];
  let preventDefault = false;
  const navigation = {
    emit: (event) => {
      events.push(event);
      return { defaultPrevented: preventDefault };
    },
    navigate: (name) => {
      state = router.getStateForAction(state, {
        type: 'NAVIGATE', payload: { name },
      }, options);
    },
  };
  return {
    get state() { return state; },
    events,
    prevent: () => { preventDefault = true; },
    bar: () => TabBar({ state, navigation }),
    buttons: () => React.Children.toArray(TabBar({ state, navigation }).props.children.props.children),
  };
}

test('only Home is registered and no bottom tab bar is rendered', () => {
  assert.deepEqual(registeredScreens.map((screen) => screen.props.name), ['Home']);
  assert.equal(registeredScreens[0].props.component, screens[0].props.component);
  assert.equal(navigator.props.initialRouteName, 'Home');
  assert.equal(navigator.props.tabBar(), null);
  const source = fs.readFileSync(path.resolve(root, 'src/navigation/MobileNavigator.tsx'), 'utf8');
  assert.doesNotMatch(source, /import.*(?:SearchScreen|NearbyScreen|SavedScreen|TabBar)/);
  assert.equal(load('App.tsx').default().type, 'SafeAreaProvider');
});

test('retained tab code selects corresponding isolated screen fixtures', () => {
  const app = harness();
  for (const name of ['Search', 'Nearby', 'Saved', 'Home']) {
    app.buttons().find((button) => button.props.accessibilityLabel === name).props.onPress();
    assert.equal(app.state.routes[app.state.index].name, name);
    searchHookIndex = 0; searchState.length = 0;
    const screen = screens.find((item) => item.props.name === name).props.component();
    assert.equal(findByType(screen, 'Text').props.children, name === 'Home' ? 'Komyut' : name);
    assert.equal(app.buttons().filter((button) => button.props.accessibilityState.selected).length, 1);
  }
});

test('retained tab code supports cancellation, re-selection, and long press', () => {
  const app = harness();
  app.buttons()[0].props.onPress();
  assert.equal(app.events[0].type, 'tabPress');
  app.prevent();
  app.buttons()[1].props.onPress();
  assert.equal(app.state.index, 0);
  app.buttons()[2].props.onLongPress();
  assert.equal(app.events.at(-1).type, 'tabLongPress');
  assert.equal(app.events.at(-1).target, app.state.routes[2].key);
});

test('retained tab code keeps distinct token-based selection styling', () => {
  const buttons = harness().buttons();
  const flatten = (styles) => Object.assign({}, ...styles.filter(Boolean));
  assert.equal(flatten(buttons[0].props.style({ pressed: false })).backgroundColor, colors.primary);
  assert.equal(flatten(buttons[0].props.children.props.style).color, colors.surface);
  assert.equal(flatten(buttons[1].props.children.props.style).color, colors.textSecondary);
  assert.equal(buttons[0].props.accessibilityRole, 'tab');
  assert.equal(buttons[0].props.children.props.numberOfLines, undefined);
  assert.notEqual(buttons[0].props.children.props.allowFontScaling, false);
});

test('Home handles the bottom safe area; retained screens and tab bar keep their original insets', () => {
  const bar = harness().bar();
  assert.deepEqual(bar.props.edges, ['bottom', 'left', 'right']);
  assert.notEqual(bar.props.style.position, 'absolute');
  for (const item of screens) {
    searchHookIndex = 0; searchState.length = 0;
    const screen = item.props.component();
    assert.deepEqual(screen.props.edges, item.props.name === 'Home' ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']);
    assert.ok(findByType(screen, 'ScrollView') || findByType(screen, 'FlatList'));
  }
});

test('sample planner inputs, swap, and submit remain connected to local form actions', () => {
  const screen = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
  formActions.length = 0;
  const origin = findByProp(screen, 'testID', 'origin-input');
  const destination = findByProp(screen, 'testID', 'destination-input');
  assert.equal(origin.props.value, '');
  assert.equal(destination.props.value, '');
  assert.equal(origin.props.accessibilityLabel, 'From');
  assert.equal(destination.props.accessibilityLabel, 'To');
  origin.props.onChangeText('GMA, Cavite');
  destination.props.onChangeText('PITX');
  findByProp(screen, 'accessibilityLabel', 'Swap origin and destination').props.onPress();
  const scroll = findByType(screen, 'ScrollView');
  const submitButton = React.Children.toArray(scroll.props.children).find((item) =>
    item.type === 'Pressable' && item.props.children.props.children === 'Find Routes');
  submitButton.props.onPress();
  assert.deepEqual(formActions, [
    { type: 'edit', field: 'origin', value: 'GMA, Cavite' },
    { type: 'edit', field: 'destination', value: 'PITX' },
    { type: 'swap' },
    {
      type: 'submit',
      dataset: {
        stops: load('src/features/transport/data/sampleStops.ts').sampleStops,
        operators: load('src/features/transport/data/sampleOperators.ts').sampleOperators,
        routes: load('src/features/transport/data/sampleRoutes.ts').sampleRoutes,
      },
    },
  ]);
  assert.equal(keyboardDismissed, true);
});

test('sample planner shortcuts retain existing tab navigation', () => {
  const app = harness();
  const names = [];
  homeNavigate = (name) => {
    names.push(name);
    app.buttons().find((button) => button.props.accessibilityLabel === name).props.onPress();
  };
  try {
    const tree = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
    for (const [label, target] of [
      ['Search for a destination', 'Search'], ['Open Search', 'Search'],
      ['Open Nearby', 'Nearby'], ['Open Saved', 'Saved'], ['Browse stations in Search', 'Search'],
    ]) {
      const button = findByProp(tree, 'accessibilityLabel', label);
      assert.equal(button.props.accessibilityRole, 'button');
      button.props.onPress();
      assert.equal(app.state.routes[app.state.index].name, target);
    }
    assert.deepEqual(names, ['Search', 'Search', 'Nearby', 'Saved', 'Search']);
  } finally { homeNavigate = () => {}; }
});

test('sample planner validation remains visible with no journeys', () => {
  const { initialRouteSearchForm, routeSearchFormReducer } = load('src/screens/routeSearchForm.ts');
  const dataset = { stops: [], operators: [], routes: [] };
  try {
    homeState = initialRouteSearchForm;
    let tree = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
    assert.ok(findByProp(tree, 'children', 'No saved places available'));
    assert.ok(findByProp(tree, 'children', 'Sample journey planner'));
    assert.ok(findByProp(tree, 'accessibilityLabel', 'Find sample routes'));
    assert.equal(findByProp(tree, 'children', 'Sample journey 1'), undefined);
    homeState = routeSearchFormReducer(initialRouteSearchForm, { type: 'submit', dataset });
    tree = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
    assert.equal(findByProp(tree, 'accessibilityRole', 'alert').props.children,
      'Enter a starting location in From and a destination in To.');
    assert.ok(findByProp(tree, 'accessibilityLabel', 'Search for a destination'));
    homeState = routeSearchFormReducer({ ...initialRouteSearchForm, origin: 'missing', destination: 'missing' }, { type: 'submit', dataset });
    assert.match(findByProp(load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner(), 'accessibilityRole', 'alert').props.children, /No sample stop/);
  } finally { homeState = undefined; }
});

test('sample planner remains scrollable and keyboard-aware on Android and iOS', () => {
  for (const [platform, behavior] of [['android', 'height'], ['ios', 'padding']]) {
    native.Platform.OS = platform;
    const screen = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
    assert.equal(findByType(screen, 'KeyboardAvoidingView').props.behavior, behavior);
    assert.equal(findByType(screen, 'ScrollView').props.keyboardShouldPersistTaps, 'handled');
    assert.equal(findByType(screen, 'ScrollView').props.keyboardDismissMode, 'on-drag');
  }
  native.Platform.OS = 'android';
});

test('Search updates local results, filters terminals, clears queries, and keeps sample labels', () => {
  searchState.length = 0;
  const render = () => {
    searchHookIndex = 0;
    return screens[1].props.component();
  };
  const { sampleStops } = load('src/features/transport/data/sampleStops.ts');
  let screen = render();
  assert.deepEqual(findByType(screen, 'FlatList').props.data, sampleStops);
  assert.ok(findByProp(screen, 'children', 'Fictional sample stops. Not for travel planning.'));
  findByProp(screen, 'testID', 'stop-search-input').props.onChangeText('Plaza');
  screen = render();
  assert.deepEqual(findByType(screen, 'FlatList').props.data.map((stop) => stop.id), ['sample-stop-plaza']);
  findByType(screen, 'Switch').props.onValueChange(true);
  screen = render();
  assert.deepEqual(findByType(screen, 'FlatList').props.data, []);
  assert.equal(findByType(screen, 'FlatList').props.ListEmptyComponent.props.children,
    'No sample stops match your search.');
  findByProp(screen, 'accessibilityLabel', 'Clear search').props.onPress();
  screen = render();
  assert.equal(findByProp(screen, 'testID', 'stop-search-input').props.value, '');
  assert.deepEqual(findByType(screen, 'FlatList').props.data.map((stop) => stop.id),
    ['sample-stop-bayan-terminal']);
  findByType(screen, 'Switch').props.onValueChange(false);
  screen = render();
  assert.deepEqual(findByType(screen, 'FlatList').props.data, sampleStops);
  assert.equal(findByProp(screen, 'accessibilityLabel', 'Clear search').props.disabled, true);
});

test('sample planner displays only sample routes and a reverse-direction empty state', () => {
  const { initialRouteSearchForm, routeSearchFormReducer } = load('src/screens/routeSearchForm.ts');
  const dataset = {
    stops: load('src/features/transport/data/sampleStops.ts').sampleStops,
    operators: load('src/features/transport/data/sampleOperators.ts').sampleOperators,
    routes: load('src/features/transport/data/sampleRoutes.ts').sampleRoutes,
  };
  try {
    homeState = routeSearchFormReducer({ ...initialRouteSearchForm, origin: 'Bayan', destination: 'Palengke' },
      { type: 'submit', dataset });
    let screen = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
    assert.ok(findByProp(screen, 'children', 'Sample Bus: Bayan to Palengke'));
    assert.ok(findByProp(screen, 'children', 'Sample Bayan Terminal -> Sample Palengke Bus Stop'));
    assert.ok(findByProp(screen, 'children', 'Fictional sample routes. Not for travel planning. Find sample stop names in Search.'));
    homeState = routeSearchFormReducer({ ...initialRouteSearchForm, origin: 'Palengke', destination: 'Bayan' },
      { type: 'submit', dataset });
    screen = load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
    assert.ok(findByProp(screen, 'children', 'No sample journey connects these stops within three segments.'));
    assert.equal(findByProp(screen, 'children', 'Sample Bus: Bayan to Palengke'), undefined);
  } finally {
    homeState = undefined;
  }
});

test('sample planner shows transfers and totals only when every segment is calculated', () => {
  const { initialRouteSearchForm } = load('src/screens/routeSearchForm.ts');
  const { findJourneys } = load('src/features/routes/findJourneys.ts');
  const stops = load('src/features/transport/data/sampleStops.ts').sampleStops;
  const operators = load('src/features/transport/data/sampleOperators.ts').sampleOperators;
  const routes = load('src/features/transport/data/sampleRoutes.ts').sampleRoutes;
  // Synthetic UI-test bindings only; no configured amounts enter application data.
  const fareInputs = routes.slice(0, 2).map((route, index) => ({
    routeId: route.id, originStopId: route.stopIds[0], destinationStopId: route.stopIds[1],
    rule: { id: `ui-test-${index}`, name: 'Synthetic UI fare', vehicleType: route.vehicleType, currency: 'PHP',
      structure: { type: 'fixed', amountCentavos: index === 0 ? 123 : 234 }, provenance: { reliability: 'unverified' } },
  }));
  const render = (inputs) => {
    homeState = { ...initialRouteSearchForm,
      journeys: findJourneys('sample-stop-plaza', 'sample-stop-palengke', routes, stops, operators, { fareInputs: inputs }) };
    return load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner();
  };
  try {
    let screen = render(fareInputs);
    assert.ok(findByProp(screen, 'children', 'Transfers: 1'));
    assert.ok(findByProp(screen, 'children', 'Transfer at Sample Bayan Terminal'));
    assert.ok(findByProp(screen, 'children', 'Total fare estimate (unverified): PHP 3.57'));
    screen = render([fareInputs[0]]);
    assert.ok(findByProp(screen, 'children', 'Total fare incomplete: some segment fares are unknown or invalid.'));
    assert.equal(findByProp(screen, 'children', 'Total fare estimate (unverified): PHP 3.57'), undefined);
    screen = render([]);
    assert.ok(findByProp(screen, 'children', 'Total fare unknown: fares are unavailable or exceed the supported amount.'));
  } finally {
    homeState = undefined;
  }
});

test('Search selects location details by ID and handles the coordinate-free sample dataset', () => {
  searchState.length = 0;
  const render = () => { searchHookIndex = 0; return screens[1].props.component(); };
  let screen = render();
  assert.ok(findByProp(screen, 'children', 'No configured stop locations to show on a map.'));
  let list = findByType(screen, 'FlatList');
  const stop = list.props.data[0];
  let row = list.props.renderItem({ item: stop });
  findByProp(row, 'accessibilityLabel', `Location details for ${stop.name}`).props.onPress();
  screen = render();
  list = findByType(screen, 'FlatList');
  row = list.props.renderItem({ item: stop });
  const { StopMapDetails } = load('src/screens/StopMapDetails.tsx');
  const details = findByType(row, StopMapDetails);
  assert.equal(details.props.stop.id, stop.id);
  searchState.length = 0;
  searchHookIndex = 0;
  const tree = StopMapDetails(details.props);
  assert.ok(findByProp(tree, 'children', 'Map and walking directions unavailable: this stop has no valid configured coordinates.'));
  assert.equal(findByType(tree, 'Pressable'), undefined);
});

test('external map actions open validated URLs and report launch failures', async () => {
  const { StopMapDetails } = load('src/screens/StopMapDetails.tsx');
  const stop = { id: 'ui-map-test', name: 'Synthetic map fixture', type: 'bus_stop', location: { latitude: 0, longitude: 0 } };
  const opened = [];
  const original = native.Linking.openURL;
  const render = () => { searchHookIndex = 0; return StopMapDetails({ stop }); };
  searchState.length = 0;
  try {
    native.Linking.openURL = async (url) => { opened.push(url); };
    let tree = render();
    findByProp(tree, 'accessibilityLabel', `Open map for ${stop.name} outside Komyut`).props.onPress();
    findByProp(tree, 'accessibilityLabel', `Walking directions to ${stop.name} outside Komyut`).props.onPress();
    await new Promise(setImmediate);
    assert.deepEqual(opened, [
      'https://www.google.com/maps/search/?api=1&query=0%2C0',
      'https://www.google.com/maps/dir/?api=1&destination=0%2C0&travelmode=walking',
    ]);
    native.Linking.openURL = async () => { throw new Error('Synthetic launch failure'); };
    findByProp(tree, 'accessibilityLabel', `Open map for ${stop.name} outside Komyut`).props.onPress();
    await new Promise(setImmediate);
    tree = render();
    assert.ok(findByProp(tree, 'accessibilityRole', 'alert'));
  } finally {
    native.Linking.openURL = original;
    searchState.length = 0;
  }
});

test('Search exposes API loading, success, empty, error/retry and explicit sample switching', () => {
  searchState.length = 0;
  const render = () => { searchHookIndex = 0; return screens[1].props.component(); };
  let screen = render();
  findByProp(screen, 'accessibilityLabel', 'Load API stops').props.onPress();
  assert.equal(searchState[3], true);
  // Hook state fixtures: effects/fetch behavior are tested separately, not by native stubs.
  searchState[5] = { status: 'loading' };
  screen = render();
  assert.ok(findByProp(screen, 'children', 'Loading API stops. Showing fictional samples while loading.'));
  assert.equal(findByProp(screen, 'accessibilityLabel', 'Load API stops').props.disabled, true);
  const apiStop = { id: 'synthetic-api-stop', name: 'Synthetic API test stop', type: 'bus_stop' };
  searchState[5] = { status: 'success', response: { data: [apiStop], meta: { limit: 100, hasMore: true } } };
  screen = render();
  assert.deepEqual(findByType(screen, 'FlatList').props.data, [apiStop]);
  assert.ok(findByProp(screen, 'children', 'API stops. Check source details; no verification is implied.'));
  assert.ok(findByProp(screen, 'children', 'More API matches exist. Narrow your search to see them.'));
  searchState[5] = { status: 'success', response: { data: [], meta: { limit: 100, hasMore: false } } };
  screen = render();
  assert.deepEqual(findByType(screen, 'FlatList').props.data, []);
  assert.equal(findByType(screen, 'FlatList').props.ListEmptyComponent.props.children, 'No API stops match your search.');
  searchState[5] = { status: 'error', message: 'Could not reach API.' };
  screen = render();
  assert.ok(findByProp(screen, 'accessibilityRole', 'alert'));
  assert.equal(findByType(screen, 'FlatList').props.data.length, 5);
  const attempt = searchState[4];
  findByProp(screen, 'accessibilityLabel', 'Retry API stops').props.onPress();
  assert.equal(searchState[4], attempt + 1);
  const scrollHeader = findByType(screen, 'FlatList').props.ListHeaderComponent;
  React.Children.toArray(scrollHeader.props.children).find((child) => child.type === 'Pressable'
    && child.props.children.props.children === 'Use sample stops').props.onPress();
  assert.equal(searchState[3], false);
  searchState.length = 0;
});

function renderRail() {
  searchHookIndex = 0;
  return load('src/screens/RailSearchScreen.tsx').RailSearchScreen({ onBack: () => {} });
}
function textContent(tree) {
  if (!React.isValidElement(tree)) return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
  return React.Children.toArray([tree.props.children, tree.props.ListHeaderComponent]).map(textContent).join('');
}
function railBaseline() {
  return load('src/features/rail/bundledRailData.ts').loadBundledRailData();
}

function renderHome() { searchHookIndex = 0; return screens[0].props.component(); }
test('Home searches real API stops and rail stations without sample fallback', () => {
  homeState = undefined; searchState.length = 0;
  railState = { status: 'ready', active: { source: 'bundled', bundle: railBaseline() } };
  try {
    let tree = renderHome();
    assert.equal(findByProp(tree, 'accessibilityLabel', 'Search for a destination'), undefined);
    assert.equal(findByProp(tree, 'children', 'Sample journey planner'), undefined);
    const input = findByProp(tree, 'testID', 'origin-input'); input.props.onFocus();
    input.props.onChangeText('Recto');
    tree = renderHome();
    assert.ok(findByProp(tree, 'accessibilityLabel', 'Choose rail station Recto'));
    searchState[3] = { status: 'error', message: 'Synthetic failure' };
    tree = renderHome();
    assert.ok(findByProp(tree, 'children', 'Other stops are unavailable. Train station search still works.'));
    assert.doesNotMatch(textContent(tree), /Sample Bayan/);
    const stop = { id: 'api-test', name: 'Recto API fixture', type: 'bus_stop', address: 'Synthetic test address' };
    searchState[3] = { status: 'success', response: { data: [stop], meta: { limit: 100, hasMore: false } } };
    tree = renderHome();
    findByProp(tree, 'accessibilityLabel', 'Choose API stop Recto API fixture').props.onPress();
    assert.equal(homeState.origin.location.source, 'api');
    assert.equal(homeState.origin.location.stop.id, stop.id);
    searchState[3] = { status: 'success', response: { data: [], meta: { limit: 100, hasMore: false } } };
    findByProp(renderHome(), 'testID', 'destination-input').props.onFocus();
    assert.ok(findByProp(renderHome(), 'children', 'No other stops match.'));
  } finally { homeState = undefined; searchState.length = 0; }
});

test('Home selects and swaps rail stations, validates edits and produces only same-line base estimates', () => {
  homeState = undefined; searchState.length = 0;
  railState = { status: 'ready', active: { source: 'bundled', bundle: railBaseline() } };
  const choose = (field, name) => {
    findByProp(renderHome(), 'testID', `${field}-input`).props.onFocus();
    findByProp(renderHome(), 'testID', `${field}-input`).props.onChangeText(name);
    findByProp(renderHome(), 'accessibilityLabel', `Choose rail station ${name}`).props.onPress();
  };
  try {
    findByProp(renderHome(), 'accessibilityLabel', 'Find routes').props.onPress();
    assert.match(homeState.feedback, /Enter both/);
    choose('origin', 'Recto'); choose('destination', 'Antipolo');
    findByProp(renderHome(), 'accessibilityLabel', 'Find routes').props.onPress();
    let tree = renderHome();
    assert.match(textContent(tree), /PHP 33.00/);
    assert.ok(findByProp(tree, 'children', 'LRT-2'));
    assert.ok(findByProp(tree, 'children', 'Recto'));
    assert.ok(findByProp(tree, 'children', 'Antipolo'));
    assert.doesNotMatch(textContent(tree), /Offline rail baseline|Saved rail data|Update rail data|https:\/\/trains\.ph/);
    assert.equal(findByProp(tree, 'accessibilityLabel', 'Refresh rail data'), undefined);
    assert.match(textContent(findByProp(tree, 'testID', 'stored-value-fare')), /Stored value \(beep\)PHP 33.00/);
    assert.match(textContent(findByProp(tree, 'testID', 'single-journey-fare')), /Single JourneyPHP 35.00/);
    assert.equal(findByProp(tree, 'accessibilityRole', 'radiogroup'), undefined);
    assert.equal(findByProp(tree, 'accessibilityLabel', 'Fare and data details'), undefined);
    assert.equal(findByProp(tree, 'accessibilityLabel', 'Single Journey'), undefined);
    assert.ok(findByProp(tree, 'accessibilityLabel', 'Rail data source: TrainsPh'));
    assert.ok(findByProp(tree, 'accessibilityLabel', 'Data license: CC BY 4.0'));
    assert.match(textContent(findByProp(tree, 'testID', 'train-interval')), /Reported train interval: about 13 minNot live/);
    estimateDate = '2026-11-07';
    assert.match(textContent(findByProp(renderHome(), 'testID', 'train-interval')), /Timing unavailableNot live/);
    estimateDate = '2026-10-14';
    findByProp(renderHome(), 'accessibilityLabel', 'Swap origin and destination').props.onPress();
    assert.equal(homeState.origin.location.stop.id, 'lrt2_antipolo');
    choose('destination', 'Antipolo'); findByProp(renderHome(), 'accessibilityLabel', 'Find routes').props.onPress();
    assert.match(homeState.feedback, /different/);
    choose('destination', 'PITX'); findByProp(renderHome(), 'accessibilityLabel', 'Find routes').props.onPress();
    assert.ok(findByProp(renderHome(), 'children', 'Choose stations on the same line. Cross-line fares are unavailable.'));
    findByProp(renderHome(), 'testID', 'origin-input').props.onChangeText('unselected');
    assert.equal(homeState.origin.location, null);
    findByProp(renderHome(), 'accessibilityLabel', 'Find routes').props.onPress();
    assert.match(homeState.feedback, /Choose each/);
    for (const [os, behavior] of [['ios', 'padding'], ['android', 'height']]) {
      native.Platform.OS = os;
      assert.equal(findByType(renderHome(), 'KeyboardAvoidingView').props.behavior, behavior);
    }
  } finally { native.Platform.OS = 'android'; estimateDate = '2026-10-14'; homeState = undefined; searchState.length = 0; }
});

test('Home API pairs show an honest unsupported-planning result, never a invented fare', () => {
  const location = (id) => ({ text: id, location: { source: 'api', stop: { id, name: id, type: 'bus_stop' } } });
  homeState = { ...load('src/screens/commuteForm.ts').initialCommuteForm, origin: location('api-a'), destination: location('api-b') };
  searchState.length = 0;
  try {
    findByProp(renderHome(), 'accessibilityLabel', 'Find routes').props.onPress();
    assert.ok(findByProp(renderHome(), 'children', 'Route search for API stops or mixed transport sources is not available yet.'));
    assert.doesNotMatch(textContent(renderHome()), /PHP \d/);
  } finally { homeState = undefined; searchState.length = 0; }
});

test('fare details are collapsed by default and retain separate dates and attribution when expanded', () => {
  searchState.length = 0;
  const Details = load('src/screens/RailFareDetails.tsx').RailFareDetails;
  const bundle = railBaseline();
  const quote = load('src/features/rail/deriveRailBaseFare.ts').deriveRailBaseFare(bundle, { originStationId: 'lrt2_recto', destinationStationId: 'lrt2_antipolo', ticket: 'beep', date: '2026-10-14' });
  let requested = 0;
  let refreshing = false;
  const render = () => { searchHookIndex = 0; return Details({ active: { bundle, source: 'bundled' }, quote, date: '2026-10-14', refresh: () => { requested++; }, refreshing }); };
  let tree = render();
  assert.doesNotMatch(textContent(tree), /TrainsPh|Offline rail baseline|Update rail data/);
  assert.doesNotMatch(textContent(tree), /Line data generated/);
  assert.equal(findByProp(tree, 'accessibilityLabel', 'Refresh rail data'), undefined);
  findByProp(tree, 'accessibilityLabel', 'Fare and data details').props.onPress();
  tree = render();
  assert.match(textContent(tree), /Fare and station data: TrainsPh/);
  assert.equal(findByProp(tree, 'accessibilityLabel', 'Fare and data details').props.accessibilityState.expanded, true);
  for (const label of ['Line data generated:', 'Fare verification claimed by source:', 'Base fares effective from:', 'Manifest generated:', 'Source:']) assert.ok(textContent(tree).includes(label));
  findByProp(tree, 'accessibilityLabel', 'Refresh rail data').props.onPress();
  assert.equal(requested, 1);
  refreshing = true;
  assert.equal(findByProp(render(), 'accessibilityLabel', 'Refresh rail data').props.disabled, true);
  findByProp(render(), 'accessibilityLabel', 'Fare and data details').props.onPress();
  assert.equal(findByProp(render(), 'accessibilityLabel', 'Refresh rail data'), undefined);
  searchState.length = 0;
});

test('Search mode selectors expose selected labels and a working sample planner link', () => {
  searchState.length = 0;
  searchHookIndex = 0;
  const tree = screens[1].props.component();
  const stops = findByProp(tree, 'accessibilityLabel', 'Stops and terminals');
  const trains = findByProp(tree, 'accessibilityLabel', 'Search TrainsPh rail stations');
  assert.equal(stops.props.accessibilityRole, 'tab');
  assert.equal(stops.props.accessibilityState.selected, true);
  assert.match(textContent(stops), /Selected/);
  assert.equal(trains.props.accessibilityState.selected, false);
  assert.equal(findByProp(tree, 'testID', 'stop-search-input').props.placeholder, 'e.g. Sample Bayan');
  findByProp(tree, 'accessibilityLabel', 'Open sample journey planner').props.onPress();
  searchHookIndex = 0;
  const planner = screens[1].props.component();
  assert.equal(planner.type, load('src/screens/SampleJourneyPlanner.tsx').SampleJourneyPlanner);
  planner.props.onBack();
  searchHookIndex = 0;
  assert.ok(findByProp(screens[1].props.component(), 'testID', 'stop-search-input'));
  searchState.length = 0;
});

test('rail mode uses visible field and ticket selection feedback while retaining keyboard-aware scrolling', () => {
  searchState.length = 0;
  railState = { status: 'ready', active: { source: 'bundled', bundle: railBaseline() } };
  const tree = renderRail();
  const activeMode = findByProp(tree, 'accessibilityLabel', 'Train stations');
  assert.equal(activeMode.props.accessibilityRole, 'tab');
  assert.equal(activeMode.props.accessibilityState.selected, true);
  assert.match(textContent(activeMode), /Selected/);
  const from = findByProp(tree, 'accessibilityLabel', 'Select From station');
  assert.equal(from.props.accessibilityState.checked, true);
  assert.match(textContent(from), /starting pointSelecting/);
  assert.match(textContent(findByProp(tree, 'accessibilityLabel', 'Stored value (beep)')), /Selected/);
  const list = findByType(tree, 'FlatList');
  const first = list.props.data[0];
  list.props.renderItem({ item: first }).props.onPress();
  const selectedTree = renderRail();
  assert.match(textContent(findByProp(selectedTree, 'accessibilityLabel', 'Select To station')), /destinationSelecting/);
  const updatedList = findByType(selectedTree, 'FlatList');
  assert.match(textContent(updatedList.props.renderItem({ item: first })), /From station selected/);
  for (const [platform, behavior] of [['ios', 'padding'], ['android', 'height']]) {
    native.Platform.OS = platform;
    assert.equal(findByType(renderRail(), 'KeyboardAvoidingView').props.behavior, behavior);
  }
  native.Platform.OS = 'android';
  assert.equal(list.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(list.props.keyboardDismissMode, 'on-drag');
  searchState.length = 0;
});

test('rail mode is explicit, cancels API mode, and returns to unchanged sample search', () => {
  searchState.length = 0;
  const render = () => { searchHookIndex = 0; return screens[1].props.component(); };
  let tree = render();
  findByProp(tree, 'accessibilityLabel', 'Load API stops').props.onPress();
  tree = render();
  findByProp(tree, 'accessibilityLabel', 'Search TrainsPh rail stations').props.onPress();
  assert.equal(searchState[3], false);
  tree = render();
  assert.equal(tree.type, load('src/screens/RailSearchScreen.tsx').RailSearchScreen);
  tree.props.onBack();
  tree = render();
  assert.equal(findByType(tree, 'FlatList').props.data.length, 5);
  assert.ok(findByProp(tree, 'children', 'Fictional sample stops. Not for travel planning.'));
  searchState.length = 0;
});

test('rail search lists separate line-labelled stations, partial names, aliases, empty and clear states', () => {
  searchState.length = 0;
  railState = { status: 'ready', active: { source: 'bundled', bundle: railBaseline() } };
  let tree = renderRail();
  assert.equal(findByType(tree, 'FlatList').props.data.length, 51);
  assert.doesNotMatch(textContent(tree), /Bundled baseline/);
  const detail = findByType(tree, load('src/screens/RailFareDetails.tsx').RailFareDetails);
  assert.match(detail.props.active.bundle.attribution, /Fare and station data: TrainsPh/);
  assert.deepEqual(tree.props.edges, ['top', 'left', 'right']);
  assert.equal(findByType(tree, 'FlatList').props.keyboardShouldPersistTaps, 'handled');
  const row = findByType(tree, 'FlatList').props.renderItem({ item: railState.active.bundle.stations[0] });
  assert.match(textContent(row), /LRT-1 - Train station/);
  findByProp(tree, 'testID', 'rail-search-input').props.onChangeText(' ReCt ');
  tree = renderRail();
  assert.deepEqual(findByType(tree, 'FlatList').props.data.map((item) => item.id), ['lrt2_recto']);
  findByProp(tree, 'testID', 'rail-search-input').props.onChangeText('no such station');
  tree = renderRail();
  assert.equal(findByType(tree, 'FlatList').props.data.length, 0);
  assert.equal(findByType(tree, 'FlatList').props.ListEmptyComponent.props.children, 'No rail stations match your search.');
  findByProp(tree, 'accessibilityLabel', 'Clear rail search').props.onPress();
  assert.equal(findByType(renderRail(), 'FlatList').props.data.length, 51);
  const aliasStation = railState.active.bundle.stations.find((item) => item.formerNames.length);
  if (aliasStation) {
    findByProp(renderRail(), 'testID', 'rail-search-input').props.onChangeText(aliasStation.formerNames[0]);
    assert.ok(findByType(renderRail(), 'FlatList').props.data.some((item) => item.id === aliasStation.id));
  }
  searchState.length = 0;
});

test('rail station choices filter the same line, reject identical stations and expose honest ticket bases and dates', () => {
  searchState.length = 0;
  railState = { status: 'ready', active: { source: 'bundled', bundle: railBaseline() } };
  const select = (id) => {
    const list = findByType(renderRail(), 'FlatList');
    const item = list.props.data.find((station) => station.id === id);
    list.props.renderItem({ item }).props.onPress();
  };
  select('lrt2_recto');
  assert.ok(findByType(renderRail(), 'FlatList').props.data.every((station) => station.lineId === 'lrt2'));
  select('lrt2_recto');
  assert.match(textContent(renderRail()), /Choose different From and To stations/);
  select('lrt2_antipolo');
  let tree = renderRail();
  assert.match(textContent(tree), /Stored value \(beep\): PHP 33.00/);
  assert.match(textContent(tree), /Not the currently payable fare. Discounts are not applied/);
  assert.equal(findByType(tree, load('src/screens/RailFareDetails.tsx').RailFareDetails).props.quote.currentlyPayableCentavos, null);
  findByProp(tree, 'accessibilityLabel', 'Single Journey').props.onPress();
  assert.match(textContent(renderRail()), /Single Journey: PHP 35.00/);
  searchState.length = 0;
});

test('rail initialization, persisted provenance, cache fallback and refresh failures remain explicit', () => {
  searchState.length = 0;
  railState = { status: 'loading' };
  assert.match(textContent(renderRail()), /Initializing local rail data/);
  assert.equal(findByProp(renderRail(), 'accessibilityLabel', 'Retry rail initialization').props.disabled, true);
  railState = { status: 'error', message: 'Safe initialization error' };
  assert.ok(findByProp(renderRail(), 'accessibilityRole', 'alert'));
  railState = { status: 'error', message: 'Network unavailable. Previous dataset retained.', active: {
    source: 'persisted', bundle: railBaseline(), refreshedAt: '2026-10-12T12:00:00Z', cacheWarning: 'invalid_cache',
  } };
  const tree = renderRail();
  assert.equal(findByType(tree, 'FlatList').props.data.length, 51);
  assert.doesNotMatch(textContent(tree), /Persisted rail dataset. Available offline/);
  assert.equal(findByType(tree, load('src/screens/RailFareDetails.tsx').RailFareDetails).props.active.refreshedAt, '2026-10-12T12:00:00Z');
  assert.match(textContent(tree), /A cached version was invalid/);
  findByType(tree, load('src/screens/RailFareDetails.tsx').RailFareDetails).props.refresh();
  assert.equal(refreshCalls, 1);
  railState = { ...railState, status: 'refreshing' };
  assert.equal(findByType(renderRail(), load('src/screens/RailFareDetails.tsx').RailFareDetails).props.refreshing, true);
  assert.equal(findByType(renderRail(), 'FlatList').props.data.length, 51);
  searchState.length = 0;
});
