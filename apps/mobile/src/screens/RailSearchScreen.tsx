import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRailData } from '../features/rail/ui/useRailData';
import { initialRailSelection, railEstimateDate, selectRailStation } from '../features/rail/ui/railSelection';
import { deriveRailBaseFare } from '../features/rail/deriveRailBaseFare';
import type { RailStation, RailTicket } from '../features/rail/types';
import { searchStops } from '../features/transport/searchStops';
import { screenStyles } from '../styles/screenStyles';
import { RailFareDetails } from './RailFareDetails';
import { colors, radii, spacing, typography } from '../styles/tokens';

const tickets: Record<RailTicket, string> = { beep: 'Stored value (beep)', single_journey: 'Single Journey' };
function money(centavos: number): string {
  const digits = String(centavos).padStart(3, '0');
  return `PHP ${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function RailSearchScreen({ onBack }: { onBack: () => void }) {
  const { state, retry, refresh } = useRailData();
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState(initialRailSelection);
  const active = state.active;
  const bundle = active?.bundle;
  const origin = bundle?.stations.find((station) => station.id === selection.originId);
  const destination = bundle?.stations.find((station) => station.id === selection.destinationId);
  const eligible = bundle?.stations.filter((station) => selection.selecting !== 'destination' || !origin || station.lineId === origin.lineId) ?? [];
  const matches = new Set(searchStops(query, eligible).map((station) => station.id));
  const results = eligible.filter((station) => matches.has(station.id) || query.trim() !== '' &&
    [station.fullName, ...station.formerNames].some((name) => name.toLowerCase().includes(query.trim().toLowerCase())));
  const today = railEstimateDate();
  const quote = bundle && origin && destination && !selection.error
    ? deriveRailBaseFare(bundle, { originStationId: origin.id, destinationStationId: destination.id, ticket: selection.ticket, date: today }) : undefined;
  const busy = state.status === 'loading' || state.status === 'refreshing';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={screenStyles.screen}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList<RailStation>
          data={results} keyExtractor={(station) => station.id} extraData={selection}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}
          ListHeaderComponent={<View style={styles.header}>
            <Text accessibilityRole="header" style={screenStyles.title}>Train Stations</Text>
            <View accessibilityRole="tablist" style={styles.modes}>
              <Pressable accessibilityRole="tab" accessibilityLabel="Return to sample and API search" accessibilityState={{ selected: false }} onPress={onBack} style={styles.mode}>
                <Text style={styles.actionText}>Stops &amp; terminals</Text>
              </Pressable>
              <Pressable accessibilityRole="tab" accessibilityLabel="Train stations" accessibilityState={{ selected: true }} style={[styles.mode, styles.selectedMode]}>
                <Text style={styles.actionText}>Train stations</Text>
                <Text style={styles.caption}>Selected</Text>
              </Pressable>
            </View>
            {active?.cacheWarning && <Text accessibilityLiveRegion="polite" style={styles.warning}>{active.cacheWarning === 'invalid_cache' ? 'A cached version was invalid. Using the last valid rail dataset.' : 'Local storage is unavailable. Using the bundled baseline.'}</Text>}
            {state.status === 'loading' && <Text accessibilityLiveRegion="polite" style={styles.secondary}>Initializing local rail data...</Text>}
            {state.status === 'refreshing' && <Text accessibilityLiveRegion="polite" style={styles.secondary}>Refreshing rail data. The previous dataset remains available.</Text>}
            {state.message && <Text accessibilityRole={state.status === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={state.status === 'error' ? styles.error : styles.secondary}>{state.message}</Text>}
            {!active && <Pressable accessibilityRole="button" accessibilityLabel="Retry rail initialization" disabled={busy}
              accessibilityState={{ disabled: busy }} onPress={retry} style={styles.action}>
              <Text style={[styles.actionText, busy && styles.secondary]}>Retry initialization</Text>
            </Pressable>}
            <View accessibilityRole="radiogroup" style={styles.options}>
              {(['origin', 'destination'] as const).map((field) => <Pressable key={field} accessibilityRole="radio" accessibilityLabel={`Select ${field === 'origin' ? 'From' : 'To'} station`}
                accessibilityState={{ checked: selection.selecting === field }} onPress={() => { setSelection((value) => ({ ...value, selecting: field, error: null })); setQuery(''); }}
                style={[styles.option, selection.selecting === field && styles.selected]}>
                  <Text style={styles.actionText}>{field === 'origin' ? 'From - starting point' : 'To - destination'}</Text>
                  {selection.selecting === field && <Text style={styles.caption}>Selecting</Text>}
                </Pressable>)}
            </View>
            <Text style={styles.label}>From: {origin?.name ?? 'Not selected'}</Text>
            <Text style={styles.label}>To: {destination?.name ?? 'Not selected'}</Text>
            {selection.selecting === 'destination' && origin && <Text style={styles.secondary}>To stations: {bundle?.lines.find((line) => line.id === origin.lineId)?.code}</Text>}
            {selection.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{selection.error}</Text>}
            {!origin && active && <Text style={styles.secondary}>No starting station selected.</Text>}
            <Text nativeID="rail-query-label" style={styles.label}>Station name</Text>
            <TextInput testID="rail-search-input" accessibilityLabel="Search rail stations by name" accessibilityLabelledBy="rail-query-label"
              value={query} onChangeText={setQuery} maxLength={120} placeholder="e.g. Recto or PITX" placeholderTextColor={colors.textSecondary}
              autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={styles.input} />
            <Pressable accessibilityRole="button" accessibilityLabel="Clear rail search" disabled={!query} accessibilityState={{ disabled: !query }} onPress={() => setQuery('')} style={styles.action}><Text style={styles.actionText}>Clear search</Text></Pressable>
            <Text accessibilityRole="header" style={styles.label}>Ticket type</Text>
            <View accessibilityRole="radiogroup" style={styles.options}>
              {(Object.keys(tickets) as RailTicket[]).map((ticket) => <Pressable key={ticket} accessibilityRole="radio" accessibilityLabel={tickets[ticket]}
                accessibilityState={{ checked: selection.ticket === ticket }} onPress={() => setSelection((value) => ({ ...value, ticket }))}
                style={[styles.option, selection.ticket === ticket && styles.selected]}>
                  <Text style={styles.actionText}>{tickets[ticket]}</Text>
                  {selection.ticket === ticket && <Text style={styles.caption}>Selected</Text>}
                </Pressable>)}
            </View>
            {quote?.status === 'source_base_estimate' && <View style={styles.estimate}>
              <Text accessibilityRole="header" style={styles.label}>Source-recorded base-fare estimate</Text>
              <Text accessibilityLiveRegion="polite" style={styles.amount}>{tickets[quote.ticket]}: {money(quote.baseFareCentavos)}</Text>
              <Text style={styles.warning}>Not the currently payable fare. Discounts are not applied.</Text>
              {quote.sourceFreshness !== 'recent_source_claim' && <Text style={styles.warning}>Fare information may be outdated or not yet verified by the source.</Text>}
            </View>}
            {quote?.status === 'unavailable' && <Text accessibilityRole="alert" style={styles.error}>Base-fare estimate unavailable: {quote.reason.replace(/_/g, ' ')}.</Text>}
            {active && <RailFareDetails active={active} quote={quote} date={today} refresh={refresh} refreshing={busy} />}
            <Text accessibilityRole="header" style={styles.label}>Matching stations</Text>
            <Text accessibilityLiveRegion="polite" style={styles.secondary}>{results.length} rail stations</Text>
          </View>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Use ${item.name} as ${selection.selecting === 'origin' ? 'From' : 'To'}`}
            accessibilityState={{ selected: item.id === selection.originId || item.id === selection.destinationId }}
            onPress={() => { setSelection((value) => selectRailStation(value, item.id, bundle?.stations ?? [])); setQuery(''); }} style={({ pressed }) => [styles.station, pressed && styles.pressed]}>
            <Text style={styles.label}>{item.name}</Text>
            <Text style={styles.secondary}>{bundle?.lines.find((line) => line.id === item.lineId)?.code} - Train station</Text>
            {(item.id === selection.originId || item.id === selection.destinationId) && <Text style={styles.caption}>{item.id === selection.originId ? 'From station selected' : 'To station selected'}</Text>}
          </Pressable>}
          ListEmptyComponent={<Text style={styles.secondary}>{busy && !active ? 'Rail stations are loading.' : !active ? 'Rail data is unavailable. Retry initialization.' : 'No rail stations match your search.'}</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { flexGrow: 1, padding: spacing.lg }, header: { gap: spacing.sm, marginBottom: spacing.md },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  mode: { flexGrow: 1, flexBasis: 120, minHeight: 56, justifyContent: 'center', padding: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.border },
  selectedMode: { backgroundColor: colors.surface, borderBottomColor: colors.primary },
  caption: { color: colors.textSecondary, fontSize: typography.fontSize.caption, lineHeight: typography.lineHeight.caption },
  amount: { color: colors.text, fontSize: typography.fontSize.title, lineHeight: typography.lineHeight.title, fontWeight: typography.fontWeight.bold },
  label: { color: colors.text, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, fontWeight: typography.fontWeight.medium },
  secondary: { color: colors.textSecondary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  warning: { color: colors.warning, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  error: { color: colors.error, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  action: { minHeight: 48, padding: spacing.sm, justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { color: colors.primary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, fontWeight: typography.fontWeight.medium },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  option: { minHeight: 48, padding: spacing.sm, justifyContent: 'center', borderWidth: 2, borderColor: colors.border, borderRadius: radii.sm },
  selected: { backgroundColor: colors.surface, borderColor: colors.primary },
  input: { minHeight: 48, padding: spacing.md, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  estimate: { gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  station: { minHeight: 48, gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.8 },
});
