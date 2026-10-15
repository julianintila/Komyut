import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RailActiveData } from '../features/rail/persistence/createRailRepository';
import type { RailBaseFareResult } from '../features/rail/types';
import { colors, spacing, typography } from '../styles/tokens';
export function RailFareDetails({ active, quote, date, refresh, refreshing = false }: {
  active: RailActiveData; quote?: RailBaseFareResult; date: string; refresh?: () => void; refreshing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = { color: colors.textSecondary, fontSize: typography.fontSize.caption, lineHeight: typography.lineHeight.caption };
  return <View style={{ gap: spacing.sm }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Fare and data details" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ ...text, color: colors.primary }}>{expanded ? 'Hide fare details' : 'Fare details'}</Text>
    </Pressable>
    {expanded && <View style={{ gap: spacing.sm }}>
      <Text style={text}>{active.bundle.attribution}</Text>
      <Text style={text}>{active.source === 'bundled' ? 'Bundled rail snapshot' : 'Persisted rail snapshot'}</Text>
      <Text style={text}>Manifest generated: {active.bundle.generatedOn}</Text>
      <Text style={text}>Estimate date (Philippines): {date}</Text>
      {active.refreshedAt && <Text style={text}>Dataset downloaded: {active.refreshedAt}</Text>}
      {quote?.status === 'source_base_estimate' && <>
        <Text style={text}>Line data generated: {quote.provenance.generatedOn}</Text>
        <Text style={text}>Fare verification claimed by source: {quote.provenance.sourceVerifiedOn}</Text>
        <Text style={text}>Base fares effective from: {quote.provenance.faresEffectiveFrom}</Text>
        <Text style={text}>Source verification is not independent Komyut verification.</Text>
        <Text style={text}>Source: {quote.provenance.underlyingSourceUrl}</Text>
      </>}
      <Text style={text}>{active.bundle.licenseUrl}</Text>
      {refresh && <Pressable accessibilityRole="button" accessibilityLabel="Refresh rail data" accessibilityState={{ disabled: refreshing }} disabled={refreshing}
        onPress={refresh} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ ...text, color: colors.primary }}>{refreshing ? 'Updating...' : 'Check for data updates'}</Text>
      </Pressable>}
    </View>}
  </View>;
}
