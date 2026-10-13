import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from './tokens';

export const screenStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: typography.fontSize.title,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.title,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.body,
  },
});
