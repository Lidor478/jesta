/**
 * @file PhoneInputScreen.tsx
 * @description Israeli phone number input screen.
 * Validates format, sends OTP request to backend, navigates to OTP verify screen.
 *
 * @hebrew מסך הזנת מספר טלפון ישראלי ובקשת קוד SMS
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  formatIsraeliPhone,
} from '../theme/rtl';
import he from '../i18n/he.json';
import { AUTH } from '../../config/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhoneInputScreenProps {
  onOtpSent: (phone: string, confirmation: FirebaseAuthTypes.ConfirmationResult, sessionToken: string) => void;
  onBack?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PhoneInputScreen({ onOtpSent, onBack }: PhoneInputScreenProps) {
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validates Israeli mobile number.
   * Accepts: 05X-XXXXXXX, 05XXXXXXXX, +9725XXXXXXXX
   */
  const isValidPhone = (raw: string): boolean => {
    const digits = raw.replace(/\D/g, '');
    // Must be 10 digits starting with 05, or 12 digits with 972
    const local = digits.startsWith('972') ? '0' + digits.slice(3) : digits;
    return (
      local.length === 10 &&
      local.startsWith('05') &&
      ['50','51','52','53','54','55','58'].some(p => local.startsWith('0' + p.slice(1)))
    );
  };

  // ─── Input Formatting ────────────────────────────────────────────────────────

  const handlePhoneChange = (text: string) => {
    setError(null);
    // Allow only digits and hyphen
    const cleaned = text.replace(/[^\d\-]/g, '');
    setPhone(cleaned);
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    if (!isValidPhone(phone)) {
      setError(he.errors.invalid_phone);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Server-side rate limiting + session token
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.messageHe ?? he.errors.generic);
        return;
      }

      // Format phone to E.164 for Firebase (+972XXXXXXXXX)
      const digits = phone.replace(/\D/g, '');
      const fullPhone = digits.startsWith('972')
        ? `+${digits}`
        : `+972${digits.slice(1)}`;

      // Firebase sends the SMS and returns a confirmation object
      const confirmation = await auth().signInWithPhoneNumber(fullPhone);

      onOtpSent(phone, confirmation, data.sessionToken);
    } catch {
      setError(he.errors.network);
    } finally {
      setIsLoading(false);
    }
  };

  const displayPhone = phone ? formatIsraeliPhone(phone) : '';
  const canSubmit = isValidPhone(phone) && !isLoading;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Back button */}
        {onBack && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>{'→'}</Text>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>{he.app.name}</Text>
          <Text style={styles.title}>{he.auth.phone_title}</Text>
          <Text style={styles.subtitle}>{he.auth.phone_subtitle}</Text>
        </View>

        {/* Phone Input Card */}
        <View style={styles.card}>
          <Text style={styles.inputLabel}>{he.auth.phone_prefix}</Text>

          <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
            {/* Country prefix badge */}
            <View style={styles.prefixBadge}>
              <Text style={styles.prefixFlag}>🇮🇱</Text>
              <Text style={styles.prefixText}>+972</Text>
            </View>

            {/* Phone text input */}
            <TextInput
              ref={inputRef}
              style={styles.phoneInput}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder={he.auth.phone_placeholder}
              placeholderTextColor={Colors.textDisabled}
              keyboardType="phone-pad"
              maxLength={13}
              autoFocus
              // RTL-specific
              textAlign="right"
              writingDirection="ltr"  // Phone numbers are LTR even in RTL UI
              returnKeyType="done"
              onSubmitEditing={canSubmit ? handleSendOtp : undefined}
            />
          </View>

          {/* Error message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Formatted preview */}
          {displayPhone && !error && (
            <Text style={styles.previewText}>{displayPhone}</Text>
          )}
        </View>

        {/* Send OTP Button */}
        <TouchableOpacity
          style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
          onPress={handleSendOtp}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.sendButtonText}>{he.auth.send_code}</Text>
          )}
        </TouchableOpacity>

        {/* Legal */}
        <Text style={styles.legalText}>
          {he.auth.agree_terms}{' '}
          <Text style={styles.legalLink}>{he.auth.terms}</Text>
          {' '}{he.auth.and}{' '}
          <Text style={styles.legalLink}>{he.auth.privacy}</Text>
        </Text>
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
    alignItems: 'stretch',
  },
  backButton: {
    alignSelf: 'flex-start',  // RTL: flex-start = right side
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  backText: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xl,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  inputLabel: {
    ...Typography.label,
    marginBottom: Spacing.sm,
    textAlign: 'right',
  },
  inputRow: {
    flexDirection: 'row-reverse',  // RTL: phone number on right, prefix on left
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  inputRowError: {
    borderColor: Colors.error,
  },
  prefixBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primaryLight,
    gap: Spacing.xs,
    borderLeftWidth: 1,    // RTL: left border = separates from right-aligned input
    borderLeftColor: Colors.border,
  },
  prefixFlag: {
    fontSize: 18,
  },
  prefixText: {
    ...Typography.label,
    color: Colors.primary,
  },
  phoneInput: {
    flex: 1,
    ...Typography.h3,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
  },
  errorContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    textAlign: 'right',
  },
  previewText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: Spacing.xs,
    letterSpacing: 1,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.textDisabled,
    ...Shadows.sm,
  },
  sendButtonText: {
    ...Typography.button,
    color: Colors.textInverse,
  },
  legalText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  legalLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
