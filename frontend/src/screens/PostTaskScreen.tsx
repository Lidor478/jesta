/**
 * @file PostTaskScreen.tsx
 * @description Multi-step Hebrew task creation form.
 *
 * Step 1 — What: Title, category, description
 * Step 2 — Where & When: Address, map pin, scheduled date
 * Step 3 — Budget: Price range, community toggle
 * Step 4 — Review & Post
 *
 * @hebrew טופס פרסום משימה בעברית — מרובה שלבים
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, Alert,
  KeyboardAvoidingView, Platform, Switch, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows, formatNIS, formatTime } from '../theme/rtl';
import he from '../i18n/he.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { taskApi } from '../services/api';
import DateTimePicker from '../components/DateTimePicker';
import AddressAutocomplete from '../components/AddressAutocomplete';

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'DRIVING' | 'CLEANING' | 'MOVING' | 'ERRANDS' | 'TECH_HELP' | 'ELDERLY_CARE' | 'OTHER';

interface TaskDraft {
  title: string;
  description: string;
  category: Category | null;
  budgetMin: string;
  budgetMax: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scheduledAt: string | null;
  estimatedHours: string;
  isCommunityTask: boolean;
  requiresVehicle: boolean;
}

interface EditTaskData {
  id: string;
  title: string;
  description: string;
  category: Category;
  budgetMin: number | null;
  budgetMax: number;
  address: string;
  latitude: number;
  longitude: number;
  scheduledAt: string | null;
  estimatedHours: number | null;
  isCommunityTask: boolean;
  requiresVehicle: boolean;
}

interface PostTaskScreenProps {
  onSuccess: (taskId: string) => void;
  onBack: () => void;
  editTask?: EditTaskData;
}

const TOTAL_STEPS = 4;

const CATEGORIES: { key: Category; emoji: string }[] = [
  { key: 'DRIVING',      emoji: '🚗' },
  { key: 'CLEANING',     emoji: '🧹' },
  { key: 'MOVING',       emoji: '📦' },
  { key: 'ERRANDS',      emoji: '🛍️' },
  { key: 'TECH_HELP',    emoji: '💻' },
  { key: 'ELDERLY_CARE', emoji: '👴' },
  { key: 'OTHER',        emoji: '✨' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostTaskScreen({ onSuccess, onBack, editTask }: PostTaskScreenProps) {
  const isEditMode = !!editTask;
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(() => {
    if (editTask) {
      return {
        title: editTask.title,
        description: editTask.description,
        category: editTask.category,
        budgetMin: editTask.budgetMin ? String(editTask.budgetMin) : '',
        budgetMax: String(editTask.budgetMax),
        address: editTask.address,
        latitude: editTask.latitude,
        longitude: editTask.longitude,
        scheduledAt: editTask.scheduledAt,
        estimatedHours: editTask.estimatedHours ? String(editTask.estimatedHours) : '',
        isCommunityTask: editTask.isCommunityTask,
        requiresVehicle: editTask.requiresVehicle,
      };
    }
    return {
      title: '', description: '', category: null,
      budgetMin: '', budgetMax: '', address: '',
      latitude: null, longitude: null,
      scheduledAt: null, estimatedHours: '',
      isCommunityTask: false, requiresVehicle: false,
    };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof TaskDraft, string>>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  const update = useCallback(<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);

  // ─── Validation per step ─────────────────────────────────────────────────────

  const validateStep = (): boolean => {
    const newErrors: typeof errors = {};

    if (step === 1) {
      if (!draft.title.trim() || draft.title.length < 5)
        newErrors.title = 'כותרת חייבת להיות לפחות 5 תווים';
      if (!draft.category) newErrors.category = 'יש לבחור קטגוריה';
      if (!draft.description.trim() || draft.description.length < 10)
        newErrors.description = 'תיאור חייב להיות לפחות 10 תווים';
    }

    if (step === 2) {
      if (!draft.address.trim()) newErrors.address = 'יש להזין כתובת';
      if (!draft.latitude || !draft.longitude) newErrors.address = 'יש לבחור כתובת מהרשימה';
    }

    if (step === 3 && !draft.isCommunityTask) {
      const max = parseFloat(draft.budgetMax);
      if (!draft.budgetMax || isNaN(max) || max < 50)
        newErrors.budgetMax = 'מחיר מינימלי הוא 50 ₪';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step < TOTAL_STEPS) {
        setStep((s) => s + 1);
      } else {
        Alert.alert(
          isEditMode ? he.tasks.confirm_edit_title : he.tasks.confirm_post_title,
          isEditMode ? he.tasks.confirm_edit_body : he.tasks.confirm_post_body,
          [
            { text: he.common.cancel, style: 'cancel' },
            { text: he.common.confirm, onPress: handleSubmit },
          ]
        );
      }
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!draft.latitude || !draft.longitude) {
      Alert.alert('שגיאה', 'יש לבחור כתובת עם מיקום');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('@jesta/access_token');
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category,
        budgetMax: draft.isCommunityTask ? 0 : parseFloat(draft.budgetMax),
        budgetMin: draft.budgetMin ? parseFloat(draft.budgetMin) : undefined,
        address: draft.address.trim(),
        latitude: draft.latitude,
        longitude: draft.longitude,
        scheduledAt: draft.scheduledAt ?? undefined,
        estimatedHours: draft.estimatedHours ? parseFloat(draft.estimatedHours) : undefined,
        isCommunityTask: draft.isCommunityTask,
        requiresVehicle: draft.requiresVehicle || draft.category === 'DRIVING',
      };

      if (isEditMode && token) {
        const data = await taskApi.update(editTask!.id, payload, token);
        Alert.alert('✓', he.tasks.task_updated);
        onSuccess(editTask!.id);
      } else {
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          Alert.alert('שגיאה', data.messageHe ?? he.errors.generic);
          return;
        }
        onSuccess(data.task.id);
      }
    } catch {
      Alert.alert('שגיאה', he.errors.network);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={step > 1 ? () => setStep((s) => s - 1) : onBack}>
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? he.tasks.edit_task : he.tasks.post_task}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>
      <Text style={styles.stepLabel}>שלב {step} מתוך {TOTAL_STEPS}</Text>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && <StepWhat draft={draft} update={update} errors={errors} />}
          {step === 2 && (
            <StepWhereWhen
              draft={draft}
              update={update}
              errors={errors}
              onOpenDatePicker={() => setShowDatePicker(true)}
            />
          )}
          {step === 3 && <StepBudget draft={draft} update={update} errors={errors} />}
          {step === 4 && <StepReview draft={draft} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, isSubmitting && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === TOTAL_STEPS ? (isEditMode ? he.common.save : he.tasks.post) : he.common.next}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <DateTimePicker
        visible={showDatePicker}
        onConfirm={(date) => {
          update('scheduledAt', date.toISOString());
          setShowDatePicker(false);
        }}
        onCancel={() => setShowDatePicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Step 1: What ─────────────────────────────────────────────────────────────

function StepWhat({ draft, update, errors }: any) {
  return (
    <View>
      <Text style={styles.stepTitle}>מה צריכים?</Text>

      {/* Category Grid */}
      <Text style={styles.fieldLabel}>{he.tasks.category_label}</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map(({ key, emoji }) => (
          <TouchableOpacity
            key={key}
            style={[styles.categoryChip, draft.category === key && styles.categoryChipSelected]}
            onPress={() => update('category', key)}
          >
            <Text style={styles.categoryEmoji}>{emoji}</Text>
            <Text style={[styles.categoryText, draft.category === key && styles.categoryTextSelected]}>
              {(he.categories as any)[key]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

      {/* Title */}
      <Text style={styles.fieldLabel}>{he.tasks.task_title_label}</Text>
      <TextInput
        style={[styles.textInput, errors.title && styles.textInputError]}
        value={draft.title}
        onChangeText={(v) => update('title', v)}
        placeholder={he.tasks.task_title_placeholder}
        placeholderTextColor={Colors.textDisabled}
        textAlign="right"
        maxLength={100}
      />
      {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
      <Text style={styles.charCount}>{draft.title.length}/100</Text>

      {/* Description */}
      <Text style={styles.fieldLabel}>{he.tasks.task_desc_label}</Text>
      <TextInput
        style={[styles.textInput, styles.textArea, errors.description && styles.textInputError]}
        value={draft.description}
        onChangeText={(v) => update('description', v)}
        placeholder={he.tasks.task_desc_placeholder}
        placeholderTextColor={Colors.textDisabled}
        textAlign="right"
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        maxLength={2000}
      />
      {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
    </View>
  );
}

// ─── Step 2: Where & When ─────────────────────────────────────────────────────

function StepWhereWhen({ draft, update, errors, onOpenDatePicker }: any) {
  return (
    <View>
      <Text style={styles.stepTitle}>איפה ומתי?</Text>

      <Text style={styles.fieldLabel}>{he.tasks.location_label}</Text>
      <AddressAutocomplete
        value={draft.address}
        onSelect={({ address, latitude, longitude }) => {
          update('address', address);
          update('latitude', latitude);
          update('longitude', longitude);
        }}
        placeholder={he.tasks.address_placeholder}
        error={errors.address}
      />

      <Text style={styles.fieldLabel}>{he.tasks.schedule_label}</Text>
      <View style={styles.scheduleRow}>
        <TouchableOpacity
          style={[styles.scheduleChip, !draft.scheduledAt && styles.scheduleChipSelected]}
          onPress={() => update('scheduledAt', null)}
        >
          <Text style={[styles.scheduleChipText, !draft.scheduledAt && styles.scheduleChipTextSelected]}>
            {he.tasks.schedule_asap}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scheduleChip, draft.scheduledAt && styles.scheduleChipSelected]}
          onPress={onOpenDatePicker}
        >
          <Text style={[styles.scheduleChipText, draft.scheduledAt && styles.scheduleChipTextSelected]}>
            {he.tasks.schedule_specific}
          </Text>
        </TouchableOpacity>
      </View>

      {draft.scheduledAt && (
        <View style={styles.selectedDateRow}>
          <Text style={styles.selectedDateText}>
            {new Date(draft.scheduledAt).toLocaleDateString('he-IL')} | {formatTime(new Date(draft.scheduledAt))}
          </Text>
          <TouchableOpacity onPress={onOpenDatePicker}>
            <Text style={styles.changeDateLink}>שנה</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.fieldLabel}>שעות עבודה משוערות</Text>
      <TextInput
        style={styles.textInput}
        value={draft.estimatedHours}
        onChangeText={(v) => update('estimatedHours', v)}
        placeholder="לדוגמה: 2"
        keyboardType="numeric"
        textAlign="right"
      />
    </View>
  );
}

// ─── Step 3: Budget ───────────────────────────────────────────────────────────

function StepBudget({ draft, update, errors }: any) {
  return (
    <View>
      <Text style={styles.stepTitle}>תקציב ותנאים</Text>

      {/* Community task toggle */}
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>משימה קהילתית (חינם)</Text>
          <Text style={styles.toggleSubtext}>
            עזרה לקשישים ונזקקים — תרוויח נקודות קארמה
          </Text>
        </View>
        <Switch
          value={draft.isCommunityTask}
          onValueChange={(v) => update('isCommunityTask', v)}
          trackColor={{ false: Colors.border, true: Colors.secondary }}
          thumbColor={Colors.background}
        />
      </View>

      {!draft.isCommunityTask && (
        <>
          <Text style={styles.fieldLabel}>{he.tasks.budget_label}</Text>
          <View style={styles.budgetRow}>
            <TextInput
              style={[styles.textInput, styles.budgetInput]}
              value={draft.budgetMax}
              onChangeText={(v) => update('budgetMax', v)}
              placeholder="מקסימום"
              keyboardType="numeric"
              textAlign="right"
            />
            <Text style={styles.budgetSeparator}>—</Text>
            <TextInput
              style={[styles.textInput, styles.budgetInput]}
              value={draft.budgetMin}
              onChangeText={(v) => update('budgetMin', v)}
              placeholder="מינימום"
              keyboardType="numeric"
              textAlign="right"
            />
          </View>
          {errors.budgetMax && <Text style={styles.errorText}>{errors.budgetMax}</Text>}

          {/* Fee breakdown */}
          {draft.budgetMax ? (
            <View style={styles.feeCard}>
              <Text style={styles.feeTitle}>פירוט עלויות</Text>
              {[
                ['מחיר מוסכם', formatNIS(parseFloat(draft.budgetMax) || 0)],
                ['עמלת פלטפורמה (5%)', formatNIS((parseFloat(draft.budgetMax) || 0) * 0.05)],
                ['סה״כ לתשלום', formatNIS((parseFloat(draft.budgetMax) || 0) * 1.05)],
              ].map(([label, value]) => (
                <View key={label} style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{label}</Text>
                  <Text style={styles.feeValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Vehicle toggle */}
          {draft.category !== 'DRIVING' && (
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{he.tasks.vehicle_required}</Text>
                <Text style={styles.toggleSubtext}>מפעיל ביטוח זמני (+3%)</Text>
              </View>
              <Switch
                value={draft.requiresVehicle}
                onValueChange={(v) => update('requiresVehicle', v)}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.background}
              />
            </View>
          )}
        </>
      )}

      {draft.isCommunityTask && (
        <View style={styles.karmaCard}>
          <Text style={styles.karmaTitle}>❤️  תרוויח 50 נקודות קארמה</Text>
          <Text style={styles.karmaBody}>
            ניתן לממש אותן כהנחות על עמלות בעסקאות עתידיות
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function StepReview({ draft }: { draft: TaskDraft }) {
  const category = CATEGORIES.find((c) => c.key === draft.category);
  const price = draft.isCommunityTask ? 'חינם' : formatNIS(parseFloat(draft.budgetMax) || 0);

  return (
    <View>
      <Text style={styles.stepTitle}>סקירה לפני פרסום</Text>

      <View style={styles.reviewCard}>
        {[
          ['קטגוריה', `${category?.emoji ?? ''} ${draft.category ? (he.categories as any)[draft.category] : ''}`],
          ['כותרת', draft.title],
          ['מיקום', draft.address],
          ['תאריך', draft.scheduledAt ? `${new Date(draft.scheduledAt).toLocaleDateString('he-IL')} | ${formatTime(new Date(draft.scheduledAt))}` : 'בהקדם האפשרי'],
          ['תקציב', price],
        ].map(([label, value]) => (
          <View key={label} style={styles.reviewRow}>
            <Text style={styles.reviewValue}>{value}</Text>
            <Text style={styles.reviewLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.reviewDesc}>{draft.description}</Text>

      <Text style={styles.reviewNote}>
        בלחיצה על "פרסם" המשימה תפורסם וג׳סטרים קרובים יוכלו להגיש הצעות.
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backButton: {
    width: 36, height: 36,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  progressBar: {
    height: 4, backgroundColor: Colors.divider, marginHorizontal: Spacing.lg,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  stepLabel: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center', marginVertical: Spacing.sm },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  stepTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl', marginBottom: Spacing.lg },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl', marginBottom: Spacing.sm, marginTop: Spacing.md },
  textInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: 14, color: Colors.textPrimary, textAlign: 'right',
  },
  textInputError: { borderColor: Colors.error },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  errorText: { ...Typography.caption, color: Colors.error, textAlign: 'right', marginTop: 4 },
  charCount: { ...Typography.caption, color: Colors.textDisabled, textAlign: 'left', marginTop: 4 },
  categoryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  categoryChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: 14, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  categoryChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  categoryEmoji: { fontSize: 16 },
  categoryText: { fontSize: 13, color: Colors.textSecondary },
  categoryTextSelected: { color: Colors.primary, fontWeight: '600' },
  scheduleRow: { flexDirection: 'row-reverse', gap: Spacing.sm },
  scheduleChip: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  scheduleChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  scheduleChipText: { ...Typography.bodySmall, color: Colors.textSecondary },
  scheduleChipTextSelected: { color: Colors.primary, fontWeight: '600' },
  selectedDateRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'center', marginTop: Spacing.sm,
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  selectedDateText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },
  changeDateLink: { ...Typography.bodySmall, color: Colors.primary, textDecorationLine: 'underline' },
  toggleRow: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: 14, marginVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  toggleSubtext: { ...Typography.caption, color: Colors.textSecondary },
  budgetRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: Spacing.sm },
  budgetInput: { flex: 1 },
  budgetSeparator: { ...Typography.body, color: Colors.textSecondary },
  feeCard: {
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  feeTitle: { ...Typography.label, color: Colors.primary, marginBottom: Spacing.sm },
  feeRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 },
  feeLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  feeValue: { ...Typography.bodySmall, fontWeight: '600' },
  karmaCard: {
    backgroundColor: '#ECFDF5', borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: '#A7F3D0', padding: Spacing.md, marginTop: Spacing.md,
  },
  karmaTitle: { ...Typography.label, color: Colors.secondary, marginBottom: Spacing.xs },
  karmaBody: { ...Typography.bodySmall, color: Colors.textSecondary },
  reviewCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, ...Shadows.sm,
  },
  reviewRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  reviewLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  reviewValue: { ...Typography.bodySmall, fontWeight: '600', flex: 1, textAlign: 'right', marginRight: Spacing.sm },
  reviewDesc: {
    ...Typography.body, color: Colors.textSecondary, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md,
  },
  reviewNote: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  nextButton: {
    backgroundColor: Colors.primary, paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.pill, alignItems: 'center', ...Shadows.md,
  },
  nextButtonDisabled: { backgroundColor: Colors.textDisabled },
  nextButtonText: { ...Typography.button, color: Colors.textInverse },
});
