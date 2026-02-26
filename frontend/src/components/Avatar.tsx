/**
 * @file Avatar.tsx
 * @description Circular avatar with Hebrew initials and deterministic pastel color.
 * Optional trust-score badge overlay.
 *
 * @hebrew אווטאר עגול עם אות ראשונה וציון אמון
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { trustScoreColor } from '../theme/rtl';

const PASTEL_COLORS = [
  '#7C3AED', // violet
  '#2563EB', // blue
  '#0891B2', // cyan
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#DB2777', // pink
  '#4F46E5', // indigo
];

interface AvatarProps {
  name: string;
  size?: number;
  trustScore?: number;
}

function getColor(name: string): string {
  const code = name.charCodeAt(0) || 0;
  return PASTEL_COLORS[code % PASTEL_COLORS.length];
}

export default function Avatar({ name, size = 44, trustScore }: AvatarProps) {
  const initial = name ? name.charAt(0) : '?';
  const bg = getColor(name);
  const fontSize = size * 0.4;
  const badgeSize = Math.max(18, size * 0.38);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
      </View>

      {trustScore != null && (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: trustScoreColor(trustScore) + '20',
              borderColor: trustScoreColor(trustScore),
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { fontSize: badgeSize * 0.5, color: trustScoreColor(trustScore) },
            ]}
          >
            {Math.round(trustScore)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  badgeText: {
    fontWeight: '700',
  },
});
