import { useEffect, useReducer, useRef } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { screenStyles } from '../styles/screenStyles';
import { colors, radii, spacing, typography } from '../styles/tokens';
import { initialRouteSearchForm, routeSearchFormReducer } from './routeSearchForm';
import { sampleStops } from '../features/transport/data/sampleStops';
import { sampleOperators } from '../features/transport/data/sampleOperators';
import { sampleRoutes } from '../features/transport/data/sampleRoutes';
import type { SegmentFareEstimate } from '../features/routes/findJourneys';

function formatCentavos(amount: number): string {
  const digits = String(amount).padStart(3, '0');
  return `PHP ${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function segmentFareLabel(fare: SegmentFareEstimate): string {
  if (fare.status === 'evaluated' && (fare.result.status === 'regular' || fare.result.status === 'discounted')) {
    return `Segment fare estimate (${fare.result.provenance.reliability}): ${formatCentavos(fare.result.amountCentavos)}`;
  }
  return 'Segment fare unknown or invalid.';
}

export function HomeScreen() {
  const [form, dispatch] = useReducer(routeSearchFormReducer, initialRouteSearchForm);
  const destinationInput = useRef<TextInput>(null);
  const hasError = form.feedback?.kind === 'error';

  useEffect(() => {
    if (Platform.OS === 'ios' && form.feedback) {
      AccessibilityInfo.announceForAccessibility(form.feedback.message);
    }
  }, [form.feedback]);

  function submit() {
    Keyboard.dismiss();
    dispatch({ type: 'submit', dataset: { stops: sampleStops, operators: sampleOperators, routes: sampleRoutes } });
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={screenStyles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardArea}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={screenStyles.title}>Komyut</Text>
            <Text style={screenStyles.subtitle}>Start planning your Philippine commute.</Text>
            <Text style={styles.note}>Fictional sample routes. Not for travel planning. Find sample stop names in Search.</Text>
          </View>

          <View style={styles.field}>
            <Text nativeID="origin-label" style={styles.label}>From</Text>
            <TextInput
              testID="origin-input"
              accessibilityLabel="From"
              accessibilityLabelledBy="origin-label"
              value={form.origin}
              onChangeText={(value) => dispatch({ type: 'edit', field: 'origin', value })}
              placeholder="e.g. Sample Bayan Terminal"
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => destinationInput.current?.focus()}
              style={[styles.input, hasError && !form.origin.trim() && styles.invalidInput]}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap origin and destination"
            onPress={() => dispatch({ type: 'swap' })}
            style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
          >
            <Text style={styles.swapLabel}>Swap locations</Text>
          </Pressable>

          <View style={styles.field}>
            <Text nativeID="destination-label" style={styles.label}>To</Text>
            <TextInput
              ref={destinationInput}
              testID="destination-input"
              accessibilityLabel="To"
              accessibilityLabelledBy="destination-label"
              value={form.destination}
              onChangeText={(value) => dispatch({ type: 'edit', field: 'destination', value })}
              placeholder="e.g. Sample Palengke Bus Stop"
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={[styles.input, hasError && !form.destination.trim() && styles.invalidInput]}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={submit}
            style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}
          >
            <Text style={styles.submitLabel}>Find Routes</Text>
          </Pressable>

          {form.feedback && (
            <Text
              accessibilityRole={hasError ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
              style={[styles.feedback, hasError && styles.error]}
            >
              {form.feedback.message}
            </Text>
          )}
          {form.journeys.map((journey, journeyIndex) => (
            <View key={journeyIndex} style={styles.routeResult}>
              <Text accessibilityRole="header" style={styles.label}>{`Sample journey ${journeyIndex + 1}`}</Text>
              <Text style={styles.feedback}>{`Transfers: ${journey.transferCount}`}</Text>
              {journey.segments.map((segment, index) => (
                <View key={segment.routeId} style={styles.routeResult}>
                  {index > 0 && <Text style={styles.label}>{`Transfer at ${segment.origin.name}`}</Text>}
                  <Text accessibilityRole="header" style={styles.label}>{segment.routeName}</Text>
                  <Text style={styles.feedback}>Operator: {segment.operator.name}</Text>
                  <Text style={styles.feedback}>Mode: {segment.vehicleType}</Text>
                  <Text style={styles.feedback}>{segment.stops.map((stop) => stop.name).join(' -> ')}</Text>
                  <Text style={styles.feedback}>{segmentFareLabel(segment.fare)}</Text>
                </View>
              ))}
              <Text style={styles.feedback}>
                {journey.fareEstimate.status === 'complete'
                  ? `Total fare estimate (${journey.fareEstimate.reliability}): ${formatCentavos(journey.fareEstimate.totalCentavos)}`
                  : journey.fareEstimate.status === 'incomplete'
                    ? 'Total fare incomplete: some segment fares are unknown or invalid.'
                    : 'Total fare unknown: fares are unavailable or exceed the supported amount.'}
              </Text>
            </View>
          ))}
        </ScrollView>
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
    gap: spacing.md,
  },
  heading: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  note: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.caption,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.body,
  },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  invalidInput: {
    borderColor: colors.error,
  },
  swapButton: {
    alignSelf: 'flex-end',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderColor: colors.border,
    borderWidth: 1,
  },
  swapLabel: {
    color: colors.primary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.body,
  },
  submitButton: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  submitLabel: {
    color: colors.surface,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.body,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  feedback: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
  },
  error: {
    color: colors.error,
  },
  routeResult: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
