/**
 * @file ProfileScreen.tsx
 * @description Full profile screen with stats, edit capability, and navigation links.
 *
 * @hebrew מסך פרופיל מלא — סטטיסטיקות, עריכה וניווט
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors, Typography, Spacing, BorderRadius,
  formatIsraeliPhone, formatDate, trustScoreColor, interpolate,
} from '../theme/rtl';
import { useAuthContext, AuthUser } from '../hooks/useAuth';
import { userApi } from '../services/api';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Card from '../components/Card';
import ScreenHeader from '../components/ScreenHeader';
import AnimatedPressable from '../components/AnimatedPressable';
import ThemedInput from '../components/ThemedInput';
import Skeleton from '../components/Skeleton';
import he from '../i18n/he.json';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullProfile extends AuthUser {
  clientRatingAvg: number;
  jesterRatingAvg: number;
  createdAt: string;
}

type Role = 'CLIENT' | 'JESTER' | 'BOTH';

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={statStyles.box}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.linkRowContent}>
        <Ionicons name={icon as any} size={20} color={Colors.primary} />
        <Text style={styles.linkRowLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textDisabled} />
    </TouchableOpacity>
  );
}

function RatingRow({ label, rating }: { label: string; rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.ratingStars}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons
            key={i}
            name={i <= fullStars ? 'star' : (i === fullStars + 1 && hasHalf ? 'star-half' : 'star-outline')}
            size={16}
            color={Colors.accent}
          />
        ))}
        <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
      </View>
    </View>
  );
}

function RoleBadge({ role }: { role: string }) {
  const roleLabels: Record<string, string> = {
    CLIENT: he.profile.role_client_label,
    JESTER: he.profile.role_jester_label,
    BOTH: he.profile.role_both_label,
  };
  const roleColors: Record<string, string> = {
    CLIENT: Colors.primary,
    JESTER: Colors.secondary,
    BOTH: Colors.accent,
  };
  const color = roleColors[role] ?? Colors.textSecondary;

  return (
    <View style={[styles.pill, { backgroundColor: color + '15', borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{roleLabels[role] ?? role}</Text>
    </View>
  );
}

function VerificationBadge({ level }: { level: string }) {
  const labels: Record<string, string> = {
    PHONE: he.profile.phone_verified,
    ID: he.profile.id_verified,
    PRO: he.profile.pro_jester,
  };
  const colors: Record<string, string> = {
    PHONE: Colors.info,
    ID: Colors.secondary,
    PRO: Colors.accent,
  };
  const color = colors[level] ?? Colors.textSecondary;

  return (
    <View style={[styles.pill, { backgroundColor: color + '15', borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{labels[level] ?? he.profile.unverified}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, logout, updateUser } = useAuthContext();
  const { toast } = useToast();

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(user?.displayName ?? '');
  const [editRole, setEditRole] = useState<Role>((user?.role as Role) ?? 'BOTH');
  const [isSaving, setIsSaving] = useState(false);

  // ─── Fetch full profile on mount ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const { user: apiUser } = await userApi.getMe() as { user: any };
        if (cancelled) return;

        const verificationMap: Record<string, AuthUser['verificationLevel']> = {
          PHONE_VERIFIED: 'PHONE',
          ID_VERIFIED: 'ID',
          PRO_JESTER: 'PRO',
        };

        setProfile({
          id: apiUser.id,
          phone: apiUser.phone,
          displayName: apiUser.displayName,
          avatarUrl: apiUser.avatarUrl,
          role: apiUser.role,
          trustScore: apiUser.trustScore,
          verificationLevel: verificationMap[apiUser.verificationLevel] ?? 'PHONE',
          isIdVerified: apiUser.isIdVerified,
          karmaPoints: apiUser.karmaPoints ?? apiUser._count?.karmaPoints ?? 0,
          completedTasksCount: apiUser.completedTasksCount ?? 0,
          clientRatingAvg: apiUser.clientRatingAvg ?? 0,
          jesterRatingAvg: apiUser.jesterRatingAvg ?? 0,
          createdAt: apiUser.createdAt,
        });
      } catch (err) {
        console.error('[ProfileScreen] fetch error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  // Merge: show cached user immediately, overlay with API data when available
  const displayUser = profile ?? user;
  const displayName = displayUser?.displayName ?? '';
  const phone = displayUser?.phone ?? '';
  const trustScore = displayUser?.trustScore ?? 0;
  const role = displayUser?.role ?? 'BOTH';
  const verificationLevel = displayUser?.verificationLevel ?? 'PHONE';
  const karmaPoints = displayUser?.karmaPoints ?? 0;
  const completedTasks = displayUser?.completedTasksCount ?? 0;
  const karmaDiscount = Math.min(5, Math.floor(karmaPoints / 100));

  // ─── Edit handlers ────────────────────────────────────────────────────────

  const openEdit = () => {
    setEditName(displayName);
    setEditRole((role as Role) ?? 'BOTH');
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setIsSaving(true);
    try {
      await userApi.updateProfile({ displayName: editName.trim(), role: editRole });
      await updateUser({ displayName: editName.trim(), role: editRole });

      // Refresh full profile
      const { user: apiUser } = await userApi.getMe() as { user: any };
      setProfile((prev) =>
        prev ? { ...prev, displayName: apiUser.displayName, role: apiUser.role } : prev,
      );

      toast(he.profile.profile_updated, 'success');
      setShowEditModal(false);
    } catch {
      toast(he.errors.generic, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Role cards for edit modal ────────────────────────────────────────────

  const roleCards: { value: Role; label: string; desc: string }[] = [
    { value: 'CLIENT', label: he.profile_setup.role_client, desc: he.profile_setup.role_client_desc },
    { value: 'JESTER', label: he.profile_setup.role_jester, desc: he.profile_setup.role_jester_desc },
    { value: 'BOTH', label: he.profile_setup.role_both, desc: he.profile_setup.role_both_desc },
  ];

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (isLoading && !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={he.profile.title} showBack={false} />
        <View style={styles.skeletonContainer}>
          <Skeleton circle size={88} />
          <Skeleton width={160} height={20} style={{ marginTop: Spacing.md }} />
          <Skeleton width={120} height={14} style={{ marginTop: Spacing.sm }} />
          <Skeleton width="100%" height={80} style={{ marginTop: Spacing.xl }} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <ScreenHeader
        title={he.profile.title}
        showBack={false}
        rightAction={
          <TouchableOpacity style={styles.editButton} onPress={openEdit}>
            <Ionicons name="create-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <Avatar name={displayName} size={88} trustScore={trustScore} />
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.phoneText}>{formatIsraeliPhone(phone)}</Text>
          <View style={styles.badgeRow}>
            <RoleBadge role={role} />
            <VerificationBadge level={verificationLevel} />
          </View>
        </View>

        {/* Stats row */}
        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <StatBox
              label={he.profile.completed_tasks}
              value={String(completedTasks)}
              color={Colors.primary}
            />
            <View style={styles.statsDivider} />
            <StatBox
              label={he.profile.trust_score}
              value={String(Math.round(trustScore))}
              color={trustScoreColor(trustScore)}
            />
            <View style={styles.statsDivider} />
            <StatBox
              label={he.profile.karma_points}
              value={String(karmaPoints)}
              color={Colors.karmaGold}
            />
          </View>
        </Card>

        {/* Karma discount */}
        {karmaDiscount > 0 && (
          <Text style={styles.karmaDiscount}>
            {interpolate(he.karma.discount_available, { percent: karmaDiscount })}
          </Text>
        )}

        {/* Ratings section */}
        {profile && (profile.clientRatingAvg > 0 || profile.jesterRatingAvg > 0) && (
          <Card style={styles.ratingsCard}>
            {profile.clientRatingAvg > 0 && (
              <RatingRow label={he.profile.client_rating} rating={profile.clientRatingAvg} />
            )}
            {profile.clientRatingAvg > 0 && profile.jesterRatingAvg > 0 && (
              <View style={styles.ratingDivider} />
            )}
            {profile.jesterRatingAvg > 0 && (
              <RatingRow label={he.profile.jester_rating} rating={profile.jesterRatingAvg} />
            )}
          </Card>
        )}

        {/* Quick links */}
        <Card style={styles.linksCard} padding="sm">
          <LinkRow
            icon="receipt-outline"
            label={he.profile.transaction_history}
            onPress={() => navigation.navigate('Transactions')}
          />
          {verificationLevel !== 'PRO' && (
            <>
              <View style={styles.linkDivider} />
              <LinkRow
                icon="star-outline"
                label={he.profile.become_pro}
                onPress={() => {}}
              />
            </>
          )}
        </Card>

        {/* Logout button */}
        <AnimatedPressable style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>{he.profile.logout}</Text>
        </AnimatedPressable>

        {/* Member since */}
        {profile?.createdAt && (
          <Text style={styles.memberSince}>
            {interpolate(he.profile.member_since, {
              date: formatDate(new Date(profile.createdAt)),
            })}
          </Text>
        )}
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{he.profile.edit_profile}</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Name input */}
            <Text style={styles.inputLabel}>{he.profile.edit_name_label}</Text>
            <ThemedInput
              value={editName}
              onChangeText={setEditName}
              placeholder={he.profile_setup.name_placeholder}
              autoFocus
            />

            {/* Role selector */}
            <Text style={[styles.inputLabel, { marginTop: Spacing.lg }]}>
              {he.profile.role_label}
            </Text>
            {roleCards.map((card) => (
              <TouchableOpacity
                key={card.value}
                style={[
                  styles.roleCard,
                  editRole === card.value && styles.roleCardSelected,
                ]}
                onPress={() => setEditRole(card.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.roleLabel,
                    editRole === card.value && styles.roleLabelSelected,
                  ]}
                >
                  {card.label}
                </Text>
                <Text style={styles.roleDesc}>{card.desc}</Text>
              </TouchableOpacity>
            ))}

            {/* Save button */}
            <AnimatedPressable
              style={[
                styles.saveButton,
                (!editName.trim() || isSaving) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={!editName.trim() || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.saveButtonText}>{he.profile.save_profile}</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  skeletonContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },

  // Edit button (header)
  editButton: {
    width: 36,
    height: 36,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  displayName: {
    ...Typography.h2,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  phoneText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pill: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Stats
  statsCard: {
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  karmaDiscount: {
    ...Typography.caption,
    color: Colors.karmaGold,
    textAlign: 'center',
    marginBottom: Spacing.md,
    fontWeight: '600',
  },

  // Ratings
  ratingsCard: {
    marginBottom: Spacing.md,
  },
  ratingRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  ratingLabel: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  ratingStars: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  ratingValue: {
    ...Typography.bodySmall,
    color: Colors.accent,
    fontWeight: '700',
    marginRight: Spacing.xs,
  },
  ratingDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },

  // Quick links
  linksCard: {
    marginBottom: Spacing.lg,
  },
  linkRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  linkRowContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  linkRowLabel: {
    ...Typography.body,
    fontWeight: '500',
  },
  linkDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },

  // Logout
  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.pill,
    borderWidth: 1.5,
    borderColor: Colors.error,
    marginBottom: Spacing.lg,
  },
  logoutText: {
    ...Typography.button,
    color: Colors.error,
  },

  // Member since
  memberSince: {
    ...Typography.caption,
    textAlign: 'center',
    color: Colors.textDisabled,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3,
  },
  inputLabel: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },

  // Role cards (edit modal)
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

  // Save button
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 17,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveButtonText: {
    ...Typography.button,
    color: Colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

const statStyles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center' },
  value: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  label: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
});
