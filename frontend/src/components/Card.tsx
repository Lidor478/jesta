/**
 * @file Card.tsx
 * @description Consistent card wrapper with shadow, border, and padding.
 *
 * @hebrew כרטיס עם צל ומסגרת אחידים
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../theme/rtl';

type ShadowLevel = 'sm' | 'md' | 'lg';
type PaddingKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface CardProps {
  shadow?: ShadowLevel;
  padding?: PaddingKey;
  style?: ViewStyle;
  children: React.ReactNode;
}

export default function Card({
  shadow = 'sm', padding = 'md', style, children,
}: CardProps) {
  return (
    <View style={[styles.base, Shadows[shadow] as ViewStyle, { padding: Spacing[padding] }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
