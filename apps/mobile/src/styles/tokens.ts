import type { ColorValue, TextStyle } from 'react-native';

export const colors = {
  primary: '#163A63',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  text: '#17212B',
  textSecondary: '#526070',
  border: '#7A8796',
  success: '#176B45',
  warning: '#8A5300',
  error: '#B42318',
} as const satisfies Record<string, ColorValue>;

export const typography = {
  fontSize: {
    caption: 14,
    body: 16,
    title: 24,
  },
  fontWeight: {
    regular: '400',
    medium: '600',
    bold: '700',
  },
  lineHeight: {
    caption: 20,
    body: 24,
    title: 32,
  },
} as const satisfies {
  fontSize: Record<string, number>;
  fontWeight: Record<string, NonNullable<TextStyle['fontWeight']>>;
  lineHeight: Record<string, number>;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const satisfies Record<string, number>;

export const radii = {
  sm: 4,
  md: 8,
} as const satisfies Record<string, number>;

export type ColorToken = keyof typeof colors;
export type TypographyToken = keyof typeof typography.fontSize;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
