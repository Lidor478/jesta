/**
 * @file ThemedInput.tsx
 * @description TextInput wrapper with animated focus border and error state.
 * RTL defaults — textAlign right, Hebrew placeholders.
 *
 * @hebrew שדה קלט עם מסגרת מונפשת בפוקוס ומצב שגיאה
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  Animated, TextInput, TextInputProps, Text, View, StyleSheet,
} from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme/rtl';

interface ThemedInputProps extends TextInputProps {
  error?: string;
  minHeight?: number;
}

export default function ThemedInput({
  error, minHeight, style, onFocus, onBlur, multiline, ...rest
}: ThemedInputProps) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = useCallback((e: any) => {
    setFocused(true);
    Animated.timing(borderAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
    onFocus?.(e);
  }, [borderAnim, onFocus]);

  const handleBlur = useCallback((e: any) => {
    setFocused(false);
    Animated.timing(borderAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
    onBlur?.(e);
  }, [borderAnim, onBlur]);

  const borderColor = error
    ? Colors.error
    : borderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.border, Colors.primary],
      });

  return (
    <View>
      <Animated.View style={[styles.wrapper, { borderColor }]}>
        <TextInput
          {...rest}
          multiline={multiline}
          style={[
            styles.input,
            multiline && { minHeight: minHeight ?? 120, textAlignVertical: 'top' },
            style,
          ]}
          placeholderTextColor={Colors.textDisabled}
          textAlign="right"
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    borderColor: Colors.border,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    textAlign: 'right',
    marginTop: 4,
  },
});
