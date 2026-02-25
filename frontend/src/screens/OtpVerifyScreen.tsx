/**
 * @file OtpVerifyScreen.tsx
 * @description 6-digit OTP verification screen.
 * Auto-submits when all 6 digits are entered. Includes Hebrew resend timer.
 * On success: stores tokens and navigates to home or profile setup.
 *
 * @hebrew מסך אימות קוד ה-SMS עם הגשה אוטומטית וספירה לאחור לשליחה חוזרת
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { ConfirmationResult } from 'firebase/auth';
import { firebaseAuth } from '../services/firebase';
import { Colors, Typography, Spacing, BorderRadius, Shadows, formatIsraeliPhone, interpolate } from '../theme/rtl';
import he from '../i18n/he.json';
import { AUTH } from '../../config/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_LENGTH = AUTH.OTP_LENGTH; // 6
const RESEND_COOLDOWN_SECONDS = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface OtpVerifyScreenProps {
  phone: string;                                          // Raw phone entered by user
  confirmation: ConfirmationResult;                        // From Firebase signInWithPhoneNumber
  sessionToken: string;                                   // From backend /otp/request
  onSuccess: (userId: string, isNewUser: boolean) => void;
  onBack: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OtpVerifyScreen({
  phone,
  confirmation,
  sessionToken,
  onSuccess,
  onBack,
}: OtpVerifyScreenProps) {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const formattedPhone = formatIsraeliPhone(phone);

  // ─── Resend Timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, []);

  // ─── Auto-submit when 6 digits filled ───────────────────────────────────────

  useEffect(() => {
    const code = otp.join('');
    if (code.length === OTP_LENGTH && !isLoading) {
      verifyOtp(code);
    }
  }, [otp]);

  // ─── OTP Input Handling ──────────────────────────────────────────────────────

  const handleDigitChange = (value: string, index: number) => {
    setError(null);
    const digit = value.replace(/\D/g, '').slice(-1); // Keep only last digit
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-focus next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace') {
      if (otp[index]) {
        // Clear current
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        // Move back to previous
        inputRefs.current[index - 1]?.focus();
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
      }
    }
  };

  // Paste handler (user copies 6-digit code from SMS)
  const handlePaste = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (digits.length === OTP_LENGTH) {
      setOtp(digits.split(''));
      inputRefs.current[OTP_LENGTH - 1]?.focus();
    }
  };

  // ─── Shake Animation (on error) ──────────────────────────────────────────────

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // ─── Verify OTP ──────────────────────────────────────────────────────────────

  /**
   * @description Verifies OTP with Firebase and registers/upserts with backend.
   * On success: calls onSuccess. Auth state is managed by useAuth via onAuthStateChanged.
   * @hebrew מאמת את קוד ה-OTP מול Firebase ורושם את המשתמש בשרת
   */
  const verifyOtp = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Verify OTP with Firebase
      await confirmation.confirm(code);

      // Get Firebase ID token to send to our backend
      const firebaseIdToken = await firebaseAuth.currentUser?.getIdToken();
      if (!firebaseIdToken) throw new Error('Failed to get Firebase ID token');

      // Register/upsert user on backend
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, firebaseIdToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.messageHe ?? he.errors.invalid_otp);
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        triggerShake();
        return;
      }

      onSuccess(data.userId, data.isNewUser);
    } catch {
      setError(he.errors.invalid_otp);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [confirmation, sessionToken, onSuccess]);

  // ─── Resend OTP ──────────────────────────────────────────────────────────────

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setIsResending(true);
    setError(null);
    setOtp(Array(OTP_LENGTH).fill(''));

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (response.ok) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        // Restart timer
        timerRef.current = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(timerRef.current); return 0; }
            return prev - 1;
          });
        }, 1000);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError(he.errors.network);
    } finally {
      setIsResending(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const otpSubtitle = interpolate(he.auth.otp_subtitle, { phone: formattedPhone });
  const resendLabel = resendCooldown > 0
    ? interpolate(he.auth.resend_in, { seconds: String(resendCooldown) })
    : he.auth.resend_code;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>{'→'}</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>{he.app.name}</Text>
          <Text style={styles.title}>{he.auth.otp_title}</Text>
          <Text style={styles.subtitle}>{otpSubtitle}</Text>
        </View>

        {/* OTP Input Boxes */}
        <Animated.View
          style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}
        >
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[
                styles.otpBox,
                digit ? styles.otpBoxFilled : null,
                error ? styles.otpBoxError : null,
              ]}
              value={digit}
              onChangeText={(val) => {
                // Handle paste of full code
                if (val.length > 1) {
                  handlePaste(val);
                } else {
                  handleDigitChange(val, index);
                }
              }}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={6}  // Allow paste
              textAlign="center"
              selectTextOnFocus
              autoFocus={index === 0}
              editable={!isLoading}
              // Accessibility
              accessibilityLabel={`ספרה ${index + 1} מתוך ${OTP_LENGTH}`}
            />
          ))}
        </Animated.View>

        {/* Hint */}
        <Text style={styles.hintText}>{he.auth.otp_hint}</Text>

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Verify button */}
        <TouchableOpacity
          style={styles.verifyButton}
          onPress={() => {
            const code = otp.join('');
            if (code.length === OTP_LENGTH) verifyOtp(code);
          }}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.verifyButtonText}>{he.auth.verify}</Text>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <View style={styles.resendContainer}>
          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0 || isResending}
          >
            <Text style={[
              styles.resendText,
              resendCooldown > 0 && styles.resendTextDisabled,
            ]}>
              {isResending ? he.common.loading : resendLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Change number */}
        <TouchableOpacity style={styles.changeNumberRow} onPress={onBack}>
          <Text style={styles.changeNumberNote}>{he.auth.wrong_number}</Text>
          <Text style={styles.changeNumberText}>{he.auth.change_number}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  backText: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  logo: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.primary,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',  // OTP digits are always LTR (numbers)
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    color: Colors.primary,
  },
  otpBoxError: {
    borderColor: Colors.error,
    backgroundColor: '#FFF0EE',
  },
  hintText: {
    fontSize: 12,
    color: Colors.textDisabled,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  verifyButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 17,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    width: '100%',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textInverse,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#FFF0EE',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.error,
    textAlign: 'center',
  },
  resendContainer: {
    marginTop: Spacing.lg,
  },
  resendText: {
    fontSize: 14,
    color: Colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  resendTextDisabled: {
    color: Colors.textDisabled,
    textDecorationLine: 'none',
  },
  changeNumberRow: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  changeNumberNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  changeNumberText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
