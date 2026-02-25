/**
 * @file DateTimePicker.tsx
 * @description Cross-platform date/time picker modal for Jesta.
 * Uses ScrollView-based day pills and time chips instead of native pickers
 * so it works on web, iOS, and Android.
 *
 * @hebrew בורר תאריך ושעה — תואם וב ומובייל
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, Dimensions,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../theme/rtl';
import he from '../i18n/he.json';

interface DateTimePickerProps {
  visible: boolean;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  minDate?: Date;
  maxDate?: Date;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06–23
const MINUTES = [0, 15, 30, 45];
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function DateTimePicker({
  visible, onConfirm, onCancel, minDate, maxDate,
}: DateTimePickerProps) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [selectedHour, setSelectedHour] = useState(10);
  const [selectedMinute, setSelectedMinute] = useState(0);

  const days = useMemo(() => {
    const result: { date: Date; label: string; subLabel: string }[] = [];
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat('he-IL', { weekday: 'short' });
    const dateFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });

    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);

      let label: string;
      if (i === 0) label = he.common.today;
      else if (i === 1) label = he.common.tomorrow;
      else label = dayFormatter.format(d);

      result.push({ date: d, label, subLabel: dateFormatter.format(d) });
    }
    return result;
  }, []);

  const handleConfirm = () => {
    const d = new Date(days[selectedDayIdx].date);
    d.setHours(selectedHour, selectedMinute, 0, 0);
    onConfirm(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{he.tasks.date_picker_title}</Text>

          {/* Day pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
            style={{ direction: 'rtl' }}
          >
            {days.map((day, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.dayPill, selectedDayIdx === idx && styles.dayPillSelected]}
                onPress={() => setSelectedDayIdx(idx)}
              >
                <Text style={[styles.dayLabel, selectedDayIdx === idx && styles.dayLabelSelected]}>
                  {day.label}
                </Text>
                <Text style={[styles.daySubLabel, selectedDayIdx === idx && styles.daySubLabelSelected]}>
                  {day.subLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Hour chips */}
          <Text style={styles.sectionLabel}>{he.tasks.select_time}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={{ direction: 'rtl' }}
          >
            {HOURS.map((h) => (
              <TouchableOpacity
                key={h}
                style={[styles.chip, selectedHour === h && styles.chipSelected]}
                onPress={() => setSelectedHour(h)}
              >
                <Text style={[styles.chipText, selectedHour === h && styles.chipTextSelected]}>
                  {String(h).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Minute chips */}
          <View style={styles.minuteRow}>
            {MINUTES.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.minuteChip, selectedMinute === m && styles.chipSelected]}
                onPress={() => setSelectedMinute(m)}
              >
                <Text style={[styles.chipText, selectedMinute === m && styles.chipTextSelected]}>
                  :{String(m).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Selected summary */}
          <Text style={styles.summary}>
            {days[selectedDayIdx].subLabel} | {String(selectedHour).padStart(2, '0')}:{String(selectedMinute).padStart(2, '0')}
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>{he.common.confirm}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>{he.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg, paddingBottom: Spacing.xxl,
    maxHeight: '80%',
  },
  title: { ...Typography.h3, textAlign: 'center', marginBottom: Spacing.md },
  sectionLabel: { ...Typography.label, marginTop: Spacing.md, marginBottom: Spacing.sm },
  dayRow: { paddingVertical: Spacing.sm, gap: Spacing.sm },
  dayPill: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', minWidth: 72,
  },
  dayPillSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  dayLabel: { ...Typography.label, color: Colors.textSecondary },
  dayLabelSelected: { color: Colors.primary },
  daySubLabel: { ...Typography.caption, color: Colors.textDisabled, marginTop: 2 },
  daySubLabelSelected: { color: Colors.primary },
  chipRow: { paddingVertical: Spacing.xs, gap: Spacing.sm },
  chip: {
    width: 48, height: 40, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  chipText: { ...Typography.label, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary },
  minuteRow: {
    flexDirection: 'row-reverse', justifyContent: 'center',
    gap: Spacing.sm, marginTop: Spacing.sm,
  },
  minuteChip: {
    width: 56, height: 40, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  summary: {
    ...Typography.body, textAlign: 'center', color: Colors.primary,
    fontWeight: '700', marginTop: Spacing.md,
  },
  actions: { marginTop: Spacing.lg, gap: Spacing.sm },
  confirmButton: {
    backgroundColor: Colors.primary, paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.pill, alignItems: 'center', ...Shadows.sm,
  },
  confirmButtonText: { ...Typography.button, color: Colors.textInverse },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelButtonText: { ...Typography.body, color: Colors.textSecondary },
});
