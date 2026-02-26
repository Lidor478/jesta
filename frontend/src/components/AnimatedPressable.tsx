/**
 * @file AnimatedPressable.tsx
 * @description TouchableOpacity with spring scale animation on press.
 * Use for primary CTA buttons to give tactile feedback.
 *
 * @hebrew כפתור אנימטיבי עם אפקט לחיצה קפיצי
 */

import React, { useRef, useCallback } from 'react';
import { Animated, TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface AnimatedPressableProps extends TouchableOpacityProps {
  scaleValue?: number;
}

export default function AnimatedPressable({
  scaleValue = 0.97, style, children, onPressIn, onPressOut, ...rest
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback((e: any) => {
    Animated.spring(scale, {
      toValue: scaleValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
    onPressIn?.(e);
  }, [scale, scaleValue, onPressIn]);

  const handlePressOut = useCallback((e: any) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
    onPressOut?.(e);
  }, [scale, onPressOut]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        {...rest}
        style={style}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.85}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}
