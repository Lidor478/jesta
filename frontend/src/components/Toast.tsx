/**
 * @file Toast.tsx
 * @description Bottom-slide toast notification with auto-dismiss.
 * Provides ToastProvider context + useToast hook.
 *
 * @hebrew הודעת טוסט תחתונה עם הסתרה אוטומטית
 *
 * @usage
 *   // Wrap app (in MainNavigator.tsx):
 *   <ToastProvider>{children}</ToastProvider>
 *
 *   // Use anywhere:
 *   const { toast } = useToast();
 *   toast('ההצעה נשלחה!', 'success');
 */

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../theme/rtl';

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  variant: ToastVariant;
  visible: boolean;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Variant config ──────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ToastVariant, { bg: string; icon: string }> = {
  success: { bg: Colors.success, icon: 'checkmark-circle' },
  error: { bg: Colors.error, icon: 'alert-circle' },
  info: { bg: Colors.primary, icon: 'information-circle' },
};

const DURATION_MS = 3000;
const ANIM_MS = 300;

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState>({
    message: '',
    variant: 'info',
    visible: false,
  });

  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 100, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
    ]).start(() => {
      setState(prev => ({ ...prev, visible: false }));
    });
  }, [translateY, opacity]);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    // Cancel existing timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Reset position immediately
    translateY.setValue(100);
    opacity.setValue(0);

    setState({ message, variant, visible: true });

    // Slide in
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss
    timerRef.current = setTimeout(hide, DURATION_MS);
  }, [translateY, opacity, hide]);

  const config = VARIANT_CONFIG[state.variant];

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {state.visible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            { transform: [{ translateY }], opacity, backgroundColor: config.bg },
          ]}
        >
          <View style={styles.content}>
            <Text style={styles.message} numberOfLines={2}>{state.message}</Text>
            <Ionicons name={config.icon as any} size={20} color="#FFFFFF" />
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 40 : 80,
    left: Spacing.lg,
    right: Spacing.lg,
    borderRadius: BorderRadius.md,
    ...Shadows.md as any,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md - 2,
    gap: Spacing.sm,
  },
  message: {
    ...Typography.bodySmall,
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'right',
  },
});
