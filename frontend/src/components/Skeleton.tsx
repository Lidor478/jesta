/**
 * @file Skeleton.tsx
 * @description Animated shimmer placeholder for loading states.
 * Pulses opacity between 0.3–0.7 using native driver.
 *
 * @hebrew שלד טעינה עם אנימציית הבהוב
 */

import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, ViewStyle } from 'react-native';
import { Colors, BorderRadius } from '../theme/rtl';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  circle?: boolean;
  size?: number;
  style?: ViewStyle;
}

export default function Skeleton({
  width, height = 16, borderRadius = BorderRadius.sm, circle, size = 44, style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const base: ViewStyle = circle
    ? { width: size, height: size, borderRadius: size / 2 }
    : { width: width ?? '100%', height, borderRadius };

  return (
    <Animated.View
      style={[{ backgroundColor: Colors.border, opacity }, base, style]}
    />
  );
}
