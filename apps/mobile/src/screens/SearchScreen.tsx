import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { screenStyles } from '../styles/screenStyles';
import { colors, radii, spacing, typography } from '../styles/tokens';
import { sampleStops } from '../features/transport/data/sampleStops';
import { searchStops } from '../features/transport/searchStops';
import type { StopType, TransportStop } from '../features/transport/types';
import { getMapStops, selectStopById } from '../features/transport/mapStops';
import { StopMapDetails } from './StopMapDetails';
import { useApiStops } from '../api/useApiStops';
import { RailSearchScreen } from './RailSearchScreen';
import { SampleJourneyPlanner } from './SampleJourneyPlanner';

const stopTypeLabels: Record<StopType, string> = {
  bus_stop: 'Bus stop',
  jeepney_stop: 'Jeepney stop',
  train_station: 'Train station',
  transport_terminal: 'Transport terminal',
};

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [terminalsOnly, setTerminalsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const api = useApiStops(query, terminalsOnly ? 'transport_terminal' : undefined);
  const [railMode, setRailMode] = useState(false);
  const [samplePlanner, setSamplePlanner] = useState(false);
  const remote = api.state.status === 'success';
  const collection = api.state.status === 'success' ? api.state.response.data : sampleStops;
  const results = searchStops(query, collection, terminalsOnly ? 'transport_terminal' : undefined);
  const selectedStop = selectedId === null ? undefined : selectStopById(results, selectedId);
  const mapStops = getMapStops(results);

  if (railMode) return <RailSearchScreen onBack={() => setRailMode(false)} />;
  if (samplePlanner) return <SampleJourneyPlanner onBack={() => setSamplePlanner(false)} />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={screenStyles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList<TransportStop>
          data={results}
          extraData={selectedId}
          keyExtractor={(stop) => stop.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <View style={styles.header}>
              <Text accessibilityRole="header" style={screenStyles.title}>Search</Text>
              <View accessibilityRole="tablist" style={styles.modes}>
                <Pressable accessibilityRole="tab" accessibilityLabel="Stops and terminals" accessibilityState={{ selected: true }} onPress={() => setRailMode(false)} style={[styles.mode, styles.selectedMode]}>
                  <Text style={styles.clearLabel}>Stops &amp; terminals</Text>
                  <Text style={styles.caption}>Selected</Text>
                </Pressable>
                <Pressable accessibilityRole="tab" accessibilityLabel="Search TrainsPh rail stations" accessibilityState={{ selected: false }}
                  onPress={() => { api.useSamples(); setSelectedId(null); setRailMode(true); }} style={styles.mode}>
                  <Text style={styles.clearLabel}>Train stations</Text>
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Open sample journey planner" onPress={() => { api.useSamples(); setSamplePlanner(true); }} style={styles.plannerAction}>
                <Text style={styles.clearLabel}>Sample journey planner</Text>
              </Pressable>
              <Text nativeID="stop-search-label" style={styles.label}>Name or address</Text>
              <TextInput
                testID="stop-search-input"
                accessibilityLabel="Search stops and terminals by name or address"
                accessibilityLabelledBy="stop-search-label"
                value={query} maxLength={120} onChangeText={setQuery}
                placeholder={remote ? 'Enter a stop name or address' : 'e.g. Sample Bayan'}
                placeholderTextColor={colors.textSecondary} autoCorrect={false}
                autoCapitalize="none" returnKeyType="search" style={styles.input}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search"
                accessibilityState={{ disabled: query.length === 0 }} disabled={query.length === 0}
                onPress={() => setQuery('')} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
                <Text style={[styles.clearLabel, query.length === 0 && styles.secondary]}>Clear search</Text>
              </Pressable>
              <Text style={styles.secondary}>{remote ? 'API stops. Check source details; no verification is implied.' : 'Fictional sample stops. Not for travel planning.'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={api.state.status === 'error' ? 'Retry API stops' : 'Load API stops'}
                disabled={api.state.status === 'loading'} accessibilityState={{ disabled: api.state.status === 'loading' }}
                onPress={api.load} style={styles.clearButton}>
                <Text style={styles.clearLabel}>{api.state.status === 'error' ? 'Retry API stops' : 'Load API stops'}</Text>
              </Pressable>
              {api.state.status !== 'sample' && <Pressable accessibilityRole="button" onPress={api.useSamples} style={styles.clearButton}>
                <Text style={styles.clearLabel}>Use sample stops</Text>
              </Pressable>}
              {api.state.status === 'loading' && <Text accessibilityLiveRegion="polite" style={styles.secondary}>Loading API stops. Showing fictional samples while loading.</Text>}
              {api.state.status === 'error' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.secondary}>{`${api.state.message} Showing fictional samples instead.`}</Text>}
              {api.state.status === 'success' && api.state.response.meta.hasMore && <Text style={styles.secondary}>More API matches exist. Narrow your search to see them.</Text>}
              {mapStops.length === 0 && <Text style={styles.secondary}>No configured stop locations to show on a map.</Text>}
              <View style={styles.filter}>
                <Text style={styles.filterLabel}>Terminals only</Text>
                <Switch
                  accessibilityLabel="Terminals only"
                  value={terminalsOnly}
                  onValueChange={setTerminalsOnly}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
              <Text accessibilityRole="header" style={styles.label}>Matching stops</Text>
              <Text accessibilityLiveRegion="polite" style={styles.secondary}>
                {results.length} {remote ? (results.length === 1 ? 'API stop' : 'API stops') : (results.length === 1 ? 'sample stop' : 'sample stops')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.stop}>
              <Text style={styles.label}>{item.name}</Text>
              <Text style={styles.secondary}>{stopTypeLabels[item.type]}</Text>
              {item.address && <Text style={styles.secondary}>{item.address}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Location details for ${item.name}`}
                accessibilityState={{ expanded: selectedStop?.id === item.id }}
                onPress={() => setSelectedId(selectedId === item.id ? null : item.id)}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
                <Text style={styles.clearLabel}>{selectedStop?.id === item.id ? 'Close location details' : 'Location details'}</Text>
              </Pressable>
              {selectedStop?.id === item.id && <StopMapDetails key={item.id} stop={selectedStop} />}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.secondary}>{remote ? 'No API stops match your search.' : 'No sample stops match your search.'}</Text>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  mode: { flexGrow: 1, flexBasis: 120, minHeight: 56, justifyContent: 'center', padding: spacing.sm,
    borderBottomWidth: 2, borderBottomColor: colors.border },
  selectedMode: { backgroundColor: colors.surface, borderBottomColor: colors.primary },
  caption: { color: colors.textSecondary, fontSize: typography.fontSize.caption, lineHeight: typography.lineHeight.caption },
  plannerAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: spacing.sm },
  label: {
    color: colors.text,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.body,
  },
  secondary: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    color: colors.text,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  clearButton: {
    minHeight: 48,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  clearLabel: {
    color: colors.primary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.body,
  },
  pressed: {
    opacity: 0.8,
  },
  filter: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  filterLabel: {
    flex: 1,
    color: colors.text,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  stop: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
