/**
 * @file ScreenHeader.tsx
 * @description Reusable RTL screen header with back button, title, and optional right action.
 *
 * @hebrew כותרת מסך RTL עם כפתור חזרה ופעולה ימנית אופציונלית
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../theme/rtl';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  showBack?: boolean;
}

export default function ScreenHeader({
  title, onBack, rightAction, showBack = true,
}: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      {showBack && onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}

      <Text style={styles.title} numberOfLines={1}>{title}</Text>

      {rightAction ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.h2,
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  spacer: {
    width: 36,
  },
});
