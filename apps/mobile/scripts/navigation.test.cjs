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
    useReducer: (_reducer, initialState) => [homeState ?? initialState, (action) => formActions.push(action)],
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
  if (cache.has(filename)) return cache.get(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const result = { exports: {} };
  const localRequire = (name) => {
    if (mocks[name]) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ['.tsx', '.ts'].find((ext) => fs.existsSync(target + ext));
    return load(target + extension);
  };
  new Function('require', 'module', 'exports', source)(localRequire, result, result.exports);
  cache.set(filename, result.exports);
  return result.exports;
}

const { MobileNavigator } = load('src/navigation/MobileNavigator.tsx');
const { TabBar } = load('src/navigation/TabBar.tsx');
const { colors } = load('src/styles/tokens.ts');
const navigator = MobileNavigator().props.children;
const screens = React.Children.toArray(navigator.props.children);
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

test('four registered tabs with Home selected by default', () => {
  assert.deepEqual(routeNames, ['Home', 'Search', 'Nearby', 'Saved']);
  const app = harness();
  assert.equal(app.state.routes[app.state.index].name, 'Home');
  assert.equal(app.buttons().length, 4);
  assert.equal(load('App.tsx').default().type, 'SafeAreaProvider');
});

test('pressing each tab selects its corresponding screen', () => {
  const app = harness();
  for (const name of ['Search', 'Nearby', 'Saved', 'Home']) {
    app.buttons().find((button) => button.props.accessibilityLabel === name).props.onPress();
    assert.equal(app.state.routes[app.state.index].name, name);
    const screen = screens.find((item) => item.props.name === name).props.component();
    assert.equal(findByType(screen, 'Text').props.children, name === 'Home' ? 'Komyut' : name);
    assert.equal(app.buttons().filter((button) => button.props.accessibilityState.selected).length, 1);
  }
});

test('tab events support cancellation, re-selection, and long press', () => {
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

test('active and inactive tabs have distinct token-based styling', () => {
  const buttons = harness().buttons();
  const flatten = (styles) => Object.assign({}, ...styles.filter(Boolean));
  assert.equal(flatten(buttons[0].props.style({ pressed: false })).backgroundColor, colors.primary);
  assert.equal(flatten(buttons[0].props.children.props.style).color, colors.surface);
  assert.equal(flatten(buttons[1].props.children.props.style).color, colors.textSecondary);
  assert.equal(buttons[0].props.accessibilityRole, 'tab');
  assert.equal(buttons[0].props.children.props.numberOfLines, undefined);
  assert.notEqual(buttons[0].props.children.props.allowFontScaling, false);
});

test('safe areas are split between scrollable screens and the flowing tab bar', () => {
  const bar = harness().bar();
  assert.deepEqual(bar.props.edges, ['bottom', 'left', 'right']);
  assert.notEqual(bar.props.style.position, 'absolute');
  for (const item of screens) {
    const screen = item.props.component();
    assert.deepEqual(screen.props.edges, ['top', 'left', 'right']);
    assert.ok(findByType(screen, 'ScrollView') || findByType(screen, 'FlatList'));
  }
});

test('Home inputs, swap, and submit are connected to local form actions', () => {
  const screen = screens[0].props.component();
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

test('Home remains scrollable and keyboard-aware on Android and iOS', () => {
  for (const [platform, behavior] of [['android', 'height'], ['ios', 'padding']]) {
    native.Platform.OS = platform;
    const screen = screens[0].props.component();
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

test('Home displays only sample route details and an explicit reverse-direction empty state', () => {
  const { initialRouteSearchForm, routeSearchFormReducer } = load('src/screens/routeSearchForm.ts');
  const dataset = {
    stops: load('src/features/transport/data/sampleStops.ts').sampleStops,
    operators: load('src/features/transport/data/sampleOperators.ts').sampleOperators,
    routes: load('src/features/transport/data/sampleRoutes.ts').sampleRoutes,
  };
  try {
    homeState = routeSearchFormReducer({ ...initialRouteSearchForm, origin: 'Bayan', destination: 'Palengke' },
      { type: 'submit', dataset });
    let screen = screens[0].props.component();
    assert.ok(findByProp(screen, 'children', 'Sample Bus: Bayan to Palengke'));
    assert.ok(findByProp(screen, 'children', 'Sample Bayan Terminal -> Sample Palengke Bus Stop'));
    assert.ok(findByProp(screen, 'children', 'Fictional sample routes. Not for travel planning. Find sample stop names in Search.'));
    homeState = routeSearchFormReducer({ ...initialRouteSearchForm, origin: 'Palengke', destination: 'Bayan' },
      { type: 'submit', dataset });
    screen = screens[0].props.component();
    assert.ok(findByProp(screen, 'children', 'No sample journey connects these stops within three segments.'));
    assert.equal(findByProp(screen, 'children', 'Sample Bus: Bayan to Palengke'), undefined);
  } finally {
    homeState = undefined;
  }
});

test('Home shows shared-stop transfers and displays totals only when every segment is calculated', () => {
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
    return screens[0].props.component();
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
