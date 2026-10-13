import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from '../styles/tokens';

export function TabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={route.name}
              accessibilityState={{ selected }}
              testID={`tab-${route.name}`}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!selected && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              onLongPress={() => {
                navigation.emit({ type: 'tabLongPress', target: route.key });
              }}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.selectedTab,
                pressed && styles.pressedTab,
              ]}
            >
              <Text style={[styles.label, selected && styles.selectedLabel]}>
                {route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  selectedTab: {
    backgroundColor: colors.primary,
  },
  pressedTab: {
    opacity: 0.8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.caption,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.caption,
    textAlign: 'center',
    flexShrink: 1,
  },
  selectedLabel: {
    color: colors.surface,
    fontWeight: typography.fontWeight.bold,
  },
});
