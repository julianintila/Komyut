import { useEffect, useReducer, useState } from 'react';
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiStops } from '../api/useApiStops';
import { useRailData } from '../features/rail/ui/useRailData';
import { railEstimateDate } from '../features/rail/ui/railSelection';
import { deriveRailBaseFare } from '../features/rail/deriveRailBaseFare';
import { getReportedRailInterval } from '../features/rail/timing/reportedRailInterval';
import type { RailTicket } from '../features/rail/types';
import { searchStops } from '../features/transport/searchStops';
import { commuteFormReducer, initialCommuteForm } from './commuteForm';
import type { CommuteLocation } from './commuteForm';
import { colors, radii, spacing, typography } from '../styles/tokens';
import { screenStyles } from '../styles/screenStyles';

const suggestionLimit = 6;

export function HomeScreen() {
  const [form, dispatch] = useReducer(commuteFormReducer, initialCommuteForm);
  const [sourceLinkFailed, setSourceLinkFailed] = useState(false);
  const rail = useRailData();
  const query = form.activeField ? form[form.activeField].text : '';
  const api = useApiStops(query);
  const active = rail.state.active;
  const bundle = active?.bundle;
  const normalized = query.trim().toLowerCase();
  const railResults = (bundle?.stations ?? []).filter((station) => [station.name, station.fullName, ...station.formerNames].some((name) => name.toLowerCase().includes(normalized)));
  const apiResults = api.state.status === 'success' ? searchStops(query, api.state.response.data) : [];
  const from = form.origin.location; const to = form.destination.location;
  const railPair = from?.source === 'rail' && to?.source === 'rail';
  const today = railEstimateDate();
  const estimate = (ticket: RailTicket) => form.submitted && railPair && bundle ? deriveRailBaseFare(bundle, { originStationId: from.stop.id, destinationStationId: to.stop.id, ticket, date: today }) : undefined;
  const quote = estimate('beep');
  const singleJourneyQuote = estimate('single_journey');
  const interval = quote?.status === 'source_base_estimate' ? getReportedRailInterval(quote.lineId, today) : undefined;
  async function openSource(url: string) {
    setSourceLinkFailed(false);
    try { await Linking.openURL(url); } catch { setSourceLinkFailed(true); }
  }
  useEffect(() => {
    if (Platform.OS === 'ios' && form.feedback) AccessibilityInfo.announceForAccessibility(form.feedback);
  }, [form.feedback]);
  function select(location: CommuteLocation) { dispatch({ type: 'select', location }); api.useSamples(); Keyboard.dismiss(); }
  function submit() { api.useSamples(); Keyboard.dismiss(); dispatch({ type: 'submit' }); }
  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={screenStyles.screen}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text accessibilityRole="header" style={screenStyles.title}>Komyut</Text>
        <Text style={styles.secondary}>Where are you headed?</Text>
        <View style={styles.locations}>
        {(['origin', 'destination'] as const).map((field) => <View key={field} style={styles.locationRow}>
          <View style={styles.markerArea}><View style={[styles.marker, field === 'destination' && styles.destinationMarker]} /></View>
          <View style={styles.locationField}>
          <Text style={styles.label}>{field === 'origin' ? 'From' : 'To'}</Text>
          <TextInput testID={`${field}-input`} accessibilityLabel={field === 'origin' ? 'From' : 'To'} value={form[field].text}
            placeholder={field === 'origin' ? 'Starting station or stop' : 'Destination station or stop'} placeholderTextColor={colors.textSecondary}
            autoCorrect={false} maxLength={120} onFocus={() => { dispatch({ type: 'focus', field }); api.load(); }}
            onChangeText={(text) => dispatch({ type: 'edit', field, text })} returnKeyType="search" onSubmitEditing={submit} style={styles.input} />
          {form[field].location && <Text style={styles.caption}>{form[field].location.source === 'rail'
            ? bundle?.lines.find((line) => line.stations.some((station) => station.id === form[field].location?.stop.id))?.code ?? 'Train station' : 'Transport stop'}</Text>}
          </View>
        </View>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Swap origin and destination" onPress={() => { dispatch({ type: 'swap' }); api.useSamples(); }} style={styles.swap}><Text style={styles.swapIcon}>{'\u21C5'}</Text></Pressable>
        </View>
        {form.activeField && <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.label}>Train stations</Text>
          {rail.state.status === 'loading' && <Text style={styles.secondary}>Loading rail stations...</Text>}
          {railResults.slice(0, suggestionLimit).map((station) => <Pressable key={station.id} accessibilityRole="button" accessibilityLabel={`Choose rail station ${station.name}`}
            onPress={() => select({ source: 'rail', stop: station })} style={styles.result}><Text style={styles.label}>{station.name}</Text><Text style={styles.caption}>{bundle?.lines.find((line) => line.id === station.lineId)?.code}</Text></Pressable>)}
          {bundle && !railResults.length && <Text style={styles.secondary}>No rail stations match.</Text>}
          {railResults.length > suggestionLimit && <Text style={styles.caption}>More stations match. Refine the station name.</Text>}
          <Text accessibilityRole="header" style={styles.label}>Other stops</Text>
          {api.state.status === 'loading' && <Text style={styles.secondary}>Searching stops...</Text>}
          {apiResults.slice(0, suggestionLimit).map((stop) => <Pressable key={stop.id} accessibilityRole="button" accessibilityLabel={`Choose API stop ${stop.name}`}
            onPress={() => select({ source: 'api', stop })} style={styles.result}><Text style={styles.label}>{stop.name}</Text><Text style={styles.caption}>{stop.type.replace(/_/g, ' ')}</Text>{stop.address && <Text style={styles.caption}>{stop.address}</Text>}</Pressable>)}
          {api.state.status === 'success' && !apiResults.length && <Text style={styles.secondary}>No other stops match.</Text>}
          {api.state.status === 'success' && (api.state.response.meta.hasMore || apiResults.length > suggestionLimit) && <Text style={styles.caption}>More API matches exist. Refine the name or address.</Text>}
          {api.state.status === 'error' && <><Text accessibilityRole="alert" style={styles.warning}>Other stops are unavailable. Train station search still works.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry API stops" onPress={api.load} style={styles.action}><Text style={styles.link}>Retry</Text></Pressable></>}
        </View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Find routes" onPress={submit} style={styles.submit}><Text style={styles.submitText}>Find Routes</Text></Pressable>
        {form.feedback && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{form.feedback}</Text>}
        {form.submitted && !railPair && <Text style={styles.secondary}>Route search for API stops or mixed transport sources is not available yet.</Text>}
        {form.submitted && railPair && <>
          {quote?.status === 'source_base_estimate' && singleJourneyQuote?.status === 'source_base_estimate' && <View style={styles.fareResult}>
            <View style={styles.fareHeading}>
              <View style={styles.routeTitle}><Text style={styles.lineLabel}>{bundle?.lines.find((line) => line.id === quote.lineId)?.code}</Text><Text style={styles.caption}>Train ride</Text></View>
            </View>
            <View style={styles.journeyStops}><Text style={styles.label}>{from?.stop.name}</Text><Text style={styles.caption}>to</Text><Text style={styles.label}>{to?.stop.name}</Text></View>
            <Text style={styles.label}>Base-fare estimates</Text>
            <View style={styles.fareComparison}>
              <View testID="stored-value-fare" style={styles.fareColumn}><Text style={styles.caption}>Stored value (beep)</Text><Text style={styles.amount}>PHP {(quote.baseFareCentavos / 100).toFixed(2)}</Text></View>
              <View testID="single-journey-fare" style={styles.fareColumn}><Text style={styles.caption}>Single Journey</Text><Text style={styles.amount}>PHP {(singleJourneyQuote.baseFareCentavos / 100).toFixed(2)}</Text></View>
            </View>
            <View testID="train-interval" style={styles.section}>
              <Text style={styles.caption}>{interval?.status === 'reported_interval'
                ? `Reported train interval: about ${interval.minimumMinutes === interval.maximumMinutes ? interval.minimumMinutes : `${interval.minimumMinutes}-${interval.maximumMinutes}`} min`
                : 'Timing unavailable'}</Text>
              <Text style={styles.caption}>Not live. Service intervals vary.</Text>
            </View>
            <Text style={styles.caption}>Not the currently payable fare. Discounts are not applied.</Text>
            {quote.sourceFreshness !== 'recent_source_claim' && <Text style={styles.warning}>Fare information may be outdated or not yet verified by the source.</Text>}
            <View style={styles.credits}>
              <Pressable accessibilityRole="link" accessibilityLabel="Rail data source: TrainsPh" onPress={() => void openSource('https://trains.ph/data/')} style={styles.action}><Text style={styles.caption}>Data: TrainsPh</Text></Pressable>
              <Pressable accessibilityRole="link" accessibilityLabel="Data license: CC BY 4.0" onPress={() => { if (bundle) void openSource(bundle.licenseUrl); }} style={styles.action}><Text style={styles.caption}>CC BY 4.0</Text></Pressable>
            </View>
            {sourceLinkFailed && <Text accessibilityRole="alert" style={styles.warning}>Could not open the source link.</Text>}
          </View>}
          {quote?.status === 'unavailable' && <Text accessibilityRole="alert" style={styles.error}>{quote.reason === 'cross_line_not_supported' ? 'Choose stations on the same line. Cross-line fares are unavailable.' : 'A base-fare estimate is unavailable for these stations or this date.'}</Text>}
        </>}
        {active?.cacheWarning && <Text style={styles.warning}>A cached update could not be used. Showing available rail data.</Text>}
        {rail.state.message && <Text accessibilityRole={rail.state.status === 'error' ? 'alert' : undefined} style={styles.warning}>{rail.state.status === 'error' && active ? 'Update failed. Available rail data is unchanged.' : rail.state.message}</Text>}
        {!active && rail.state.status === 'error' && <Pressable accessibilityRole="button" accessibilityLabel="Retry rail initialization" onPress={rail.retry} style={styles.action}><Text style={styles.link}>Retry rail data</Text></Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 }, section: { gap: spacing.sm },
  label: { color: colors.text, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, fontWeight: typography.fontWeight.medium },
  secondary: { color: colors.textSecondary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  caption: { color: colors.textSecondary, fontSize: typography.fontSize.caption, lineHeight: typography.lineHeight.caption },
  locations: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.sm },
  locationRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  locationField: { flex: 1, minWidth: 0, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  markerArea: { width: spacing.md, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  marker: { width: spacing.sm, height: spacing.sm, borderRadius: radii.sm, borderWidth: 2, borderColor: colors.success },
  destinationMarker: { borderRadius: 0, borderColor: colors.primary, backgroundColor: colors.primary },
  swap: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end' },
  swapIcon: { color: colors.primary, fontSize: typography.fontSize.title, lineHeight: typography.lineHeight.title },
  input: { minHeight: 48, paddingVertical: spacing.sm, color: colors.text, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  action: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: spacing.sm },
  link: { color: colors.primary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, fontWeight: typography.fontWeight.medium },
  submit: { minHeight: 48, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.primary },
  submitText: { color: colors.surface, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, fontWeight: typography.fontWeight.bold, textAlign: 'center' },
  result: { minHeight: 48, padding: spacing.md, gap: spacing.xs, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fareComparison: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  fareColumn: { flexGrow: 1, flexBasis: 112, minWidth: 0, gap: spacing.sm },
  credits: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md },
  fareResult: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.md },
  fareHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', alignItems: 'flex-start' },
  routeTitle: { flexGrow: 1, flexBasis: 80, gap: spacing.xs },
  lineLabel: { color: colors.success, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body, fontWeight: typography.fontWeight.bold },
  journeyStops: { gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  amount: { color: colors.text, fontSize: typography.fontSize.title, lineHeight: typography.lineHeight.title, fontWeight: typography.fontWeight.bold },
  warning: { color: colors.warning, fontSize: typography.fontSize.caption, lineHeight: typography.lineHeight.caption }, error: { color: colors.error, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
});
