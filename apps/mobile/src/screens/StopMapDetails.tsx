import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { stopMapUrl, stopWalkingUrl } from '../features/transport/mapStops';
import type { TransportStop } from '../features/transport/types';
import { colors, spacing, typography } from '../styles/tokens';

export function StopMapDetails({ stop }: { stop: TransportStop }) {
  const [failed, setFailed] = useState(false);
  const mapUrl = stopMapUrl(stop);
  const walkingUrl = stopWalkingUrl(stop);

  async function open(url: string) {
    setFailed(false);
    try {
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    }
  }

  return (
    <View style={styles.details}>
      {stop.source && <Text style={styles.text}>{stop.source.sourceName}</Text>}
      {stop.source?.notes && <Text style={styles.text}>{stop.source.notes}</Text>}
      {mapUrl && walkingUrl ? (
        <>
          <Pressable accessibilityRole="link" accessibilityLabel={`Open map for ${stop.name} outside Komyut`}
            onPress={() => void open(mapUrl)} style={styles.action}>
            <Text style={styles.link}>Open in Google Maps (outside Komyut)</Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={`Walking directions to ${stop.name} outside Komyut`}
            onPress={() => void open(walkingUrl)} style={styles.action}>
            <Text style={styles.link}>Walking directions (outside Komyut)</Text>
          </Pressable>
          <Text style={styles.text}>Choose your starting point in Google Maps. Walking availability depends on the provider.</Text>
        </>
      ) : (
        <Text style={styles.text}>Map and walking directions unavailable: this stop has no valid configured coordinates.</Text>
      )}
      {failed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
        Could not open Google Maps. Check your device and try again.
      </Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.sm },
  text: { color: colors.textSecondary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
  action: { minHeight: 48, justifyContent: 'center', paddingVertical: spacing.sm },
  link: { color: colors.primary, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body,
    fontWeight: typography.fontWeight.medium },
  error: { color: colors.error, fontSize: typography.fontSize.body, lineHeight: typography.lineHeight.body },
});
