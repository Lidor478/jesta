/**
 * @file ProfileSetupScreen.tsx
 * @description 3-step onboarding wizard: Name -> Role -> Location.
 * Shown to new users after OTP verification.
 *
 * @hebrew מסך הגדרת פרופיל ראשוני — שם, תפקיד, מיקום
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/rtl';
import { userApi } from '../services/api';
import { useAuthContext } from '../hooks/useAuth';
import he from '../i18n/he.json';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;
type Role = 'CLIENT' | 'JESTER' | 'BOTH';

interface ProfileSetupScreenProps {
  onComplete: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileSetupScreen({ onComplete }: ProfileSetupScreenProps) {
  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { loadUserProfile } = useAuthContext();

  const isNameValid = displayName.trim().length >= 2;

  // ─── Save Handler ──────────────────────────────────────────────────────────

  const handleSave = async (latitude: number | null, longitude: number | null) => {
    setIsSaving(true);
    setError(null);

    try {
      await userApi.updateProfile({ displayName: displayName.trim(), role: role! });

      if (latitude !== null && longitude !== null) {
        await userApi.updateLocation({ latitude, longitude });
      }

      await loadUserProfile();
      onComplete();
    } catch {
      setError(he.errors.generic);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Location Handler ──────────────────────────────────────────────────────

  const handleAllowLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setIsSaving(true);
        const position = await Location.getCurrentPositionAsync({});
        await handleSave(position.coords.latitude, position.coords.longitude);
      } else {
        await handleSave(null, null);
      }
    } catch {
      await handleSave(null, null);
    }
  };

  // ─── Step Dots ──────────────────────────────────────────────────────────────

  const renderDots = () => (
    <View style={styles.dotsRow}>
      {([1, 2, 3] as Step[]).map((s) => (
        <View
          key={s}
          style={[styles.dot, s === step && styles.dotActive]}
        />
      ))}
    </View>
  );

  // ─── Back Arrow ─────────────────────────────────────────────────────────────

  const renderBack = () => {
    if (step === 1) return <View style={styles.backPlaceholder} />;
    return (
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setStep((step - 1) as Step)}
      >
        <Text style={styles.backText}>{'→'}</Text>
      </TouchableOpacity>
    );
  };

  // ─── Step 1: Name ──────────────────────────────────────────────────────────

  const renderNameStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{he.profile_setup.title}</Text>
      <Text style={styles.stepSubtitle}>{he.profile_setup.subtitle}</Text>

      <Text style={styles.label}>{he.profile_setup.name_label}</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={he.profile_setup.name_placeholder}
        placeholderTextColor={Colors.textDisabled}
        textAlign="right"
        autoFocus
      />

      <TouchableOpacity
        style={[styles.primaryButton, !isNameValid && styles.buttonDisabled]}
        disabled={!isNameValid}
        onPress={() => setStep(2)}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>{he.common.next}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Step 2: Role ──────────────────────────────────────────────────────────

  const roleCards: { value: Role; label: string; desc: string }[] = [
    { value: 'CLIENT', label: he.profile_setup.role_client, desc: he.profile_setup.role_client_desc },
    { value: 'JESTER', label: he.profile_setup.role_jester, desc: he.profile_setup.role_jester_desc },
    { value: 'BOTH', label: he.profile_setup.role_both, desc: he.profile_setup.role_both_desc },
  ];

  const renderRoleStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{he.profile_setup.role_title}</Text>

      {roleCards.map((card) => (
        <TouchableOpacity
          key={card.value}
          style={[
            styles.roleCard,
            role === card.value && styles.roleCardSelected,
          ]}
          onPress={() => setRole(card.value)}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.roleLabel,
            role === card.value && styles.roleLabelSelected,
          ]}>
            {card.label}
          </Text>
          <Text style={styles.roleDesc}>{card.desc}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.primaryButton, !role && styles.buttonDisabled]}
        disabled={!role}
        onPress={() => setStep(3)}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>{he.common.next}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Step 3: Location ──────────────────────────────────────────────────────

  const renderLocationStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{he.profile_setup.location_title}</Text>
      <Text style={styles.stepSubtitle}>{he.profile_setup.location_subtitle}</Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleAllowLocation}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        {isSaving ? (
          <ActivityIndicator color={Colors.textInverse} />
        ) : (
          <Text style={styles.primaryButtonText}>{he.profile_setup.location_allow}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => handleSave(null, null)}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <Text style={styles.secondaryButtonText}>{he.profile_setup.location_later}</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.container}>
        {renderBack()}
        <Text style={styles.logo}>{he.app.name}</Text>
        {renderDots()}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {step === 1 && renderNameStep()}
        {step === 2 && renderRoleStep()}
        {step === 3 && renderLocationStep()}
      </View>
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
  logo: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.primary,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  backPlaceholder: {
    height: 44,
    marginTop: Spacing.sm,
  },
  backText: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  stepContainer: {
    width: '100%',
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    writingDirection: 'rtl',
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  label: {
    ...Typography.label,
    alignSelf: 'flex-end',
    marginBottom: Spacing.sm,
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.xl,
    writingDirection: 'rtl',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 17,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    width: '100%',
    marginTop: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textInverse,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryButton: {
    paddingVertical: 17,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    width: '100%',
    marginTop: Spacing.md,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  roleCard: {
    width: '100%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  roleCardSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 2,
  },
  roleLabelSelected: {
    color: Colors.primary,
  },
  roleDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorContainer: {
    backgroundColor: '#FFF0EE',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    width: '100%',
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.error,
    textAlign: 'center',
  },
});
