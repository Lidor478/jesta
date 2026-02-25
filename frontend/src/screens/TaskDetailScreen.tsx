/**
 * @file TaskDetailScreen.tsx
 * @description Full task detail view.
 * Adapts UI based on viewer's role (Client who posted / Jester viewing / Jester assigned).
 *
 * Views:
 *   Client (owner)  → See offers list → Accept offer → Approve completion → Dispute
 *   Jester (open)   → Submit offer form
 *   Jester (assigned) → Mark In Progress → Mark Complete
 *
 * @hebrew מסך פרטי משימה — מותאם לפי תפקיד המשתמש
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ActivityIndicator, Alert, TextInput,
  Modal,
} from 'react-native';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
  formatNIS, formatDistance, formatDate, formatRelativeTime, trustScoreColor,
} from '../theme/rtl';
import he from '../i18n/he.json';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offer {
  id: string;
  price: number | null;
  message: string | null;
  isAccepted: boolean;
  createdAt: string;
  jester: { id: string; displayName: string; trustScore: number; jesterRatingAvg: number; verificationLevel: string };
}

interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  budgetMin: number | null;
  budgetMax: number;
  agreedPrice: number | null;
  address: string;
  latitude: number;
  longitude: number;
  scheduledAt: string | null;
  estimatedHours: number | null;
  requiresVehicle: boolean;
  isCommunityTask: boolean;
  createdAt: string;
  clientId: string;
  jesterId: string | null;
  client: { id: string; displayName: string; trustScore: number; verificationLevel: string };
  jester: { id: string; displayName: string; trustScore: number; verificationLevel: string } | null;
  offers: Offer[];
  transaction: { status: string; grossAmount: number; netToJester: number } | null;
}

interface TaskDetailScreenProps {
  taskId: string;
  currentUserId: string;
  onBack: () => void;
  onOfferAccepted: (transactionId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaskDetailScreen({
  taskId, currentUserId, onBack, onOfferAccepted,
}: TaskDetailScreenProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);

  useEffect(() => { loadTask(); }, [taskId]);

  const loadTask = async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('@jesta/access_token');
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/tasks/${taskId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setTask(data.task);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  const apiAction = async (path: string, method = 'POST', body?: object) => {
    const token = await AsyncStorage.getItem('@jesta/access_token');
    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/tasks/${taskId}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  // ─── Role Detection ──────────────────────────────────────────────────────────

  const isOwner = task?.clientId === currentUserId;
  const isAssignedJester = task?.jesterId === currentUserId;
  const isOpenJester = !isOwner && !isAssignedJester && task?.status === 'OPEN';
  const hasMyOffer = task?.offers.some((o) => o.jester.id === currentUserId);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const handleSubmitOffer = async () => {
    if (!offerPrice || parseFloat(offerPrice) < 50) {
      Alert.alert('שגיאה', 'יש להזין מחיר של לפחות 50 ₪');
      return;
    }
    setActionLoading(true);
    try {
      const data = await apiAction('offers', 'POST', {
        price: parseFloat(offerPrice),
        message: offerMessage || undefined,
      });
      if (data.offer) {
        Alert.alert('✓', data.messageHe);
        setShowOfferForm(false);
        await loadTask();
      } else {
        Alert.alert('שגיאה', data.messageHe);
      }
    } finally { setActionLoading(false); }
  };

  const handleAcceptOffer = async (offerId: string, jesterName: string) => {
    Alert.alert(
      'קבל הצעה',
      `האם לקבל את הצעתו של ${jesterName}?`,
      [
        { text: he.common.cancel, style: 'cancel' },
        {
          text: he.common.confirm, onPress: async () => {
            setActionLoading(true);
            try {
              const data = await apiAction(`offers/${offerId}/accept`, 'PUT');
              if (data.task) {
                Alert.alert('✓', data.messageHe);
                onOfferAccepted(data.transaction.id);
                await loadTask();
              }
            } finally { setActionLoading(false); }
          },
        },
      ]
    );
  };

  const handleStatusAction = async (action: 'start' | 'complete' | 'approve') => {
    const messages = {
      start: { confirm: 'התחל עבודה', success: 'סימנת שהתחלת!' },
      complete: { confirm: 'סמן כהושלם', success: 'נשלחה הודעה ללקוח!' },
      approve: { confirm: 'אשר השלמה', success: 'התשלום שוחרר לג׳סטר!' },
    };
    Alert.alert(messages[action].confirm, `האם ${action === 'approve' ? 'לאשר את השלמת המשימה ולשחרר תשלום?' : 'לבצע פעולה זו?'}`,
      [
        { text: he.common.cancel, style: 'cancel' },
        {
          text: he.common.confirm, onPress: async () => {
            setActionLoading(true);
            try {
              const data = await apiAction(action);
              Alert.alert('✓', data.messageHe ?? messages[action].success);
              await loadTask();
            } finally { setActionLoading(false); }
          },
        },
      ]
    );
  };

  const handleDispute = async () => {
    if (disputeReason.length < 10) {
      Alert.alert('שגיאה', 'יש לפרט את הסיבה (לפחות 10 תווים)');
      return;
    }
    setActionLoading(true);
    try {
      const data = await apiAction('dispute', 'POST', { reason: disputeReason });
      Alert.alert('✓', data.messageHe);
      setShowDisputeModal(false);
      await loadTask();
    } finally { setActionLoading(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{he.errors.not_found}</Text>
          <TouchableOpacity onPress={onBack}><Text style={styles.backLink}>{he.common.back}</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <StatusChip status={task.status} />
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>{'→'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.categoryTag}>
            {(he.categories as any)[task.category]}
            {task.requiresVehicle ? '  🚗' : ''}
          </Text>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.address}>📍 {task.address}</Text>
          {task.scheduledAt && (
            <Text style={styles.scheduled}>
              📅 {formatDate(new Date(task.scheduledAt))}
            </Text>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תיאור המשימה</Text>
          <Text style={styles.description}>{task.description}</Text>
        </View>

        {/* Budget */}
        <View style={styles.priceBlock}>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>
              {task.isCommunityTask ? '❤️  חינם' : formatNIS(task.agreedPrice ?? task.budgetMax)}
            </Text>
            <Text style={styles.priceLabel}>
              {task.agreedPrice ? 'מחיר מוסכם' : 'תקציב'}
            </Text>
          </View>
          {!task.isCommunityTask && task.status === 'OPEN' && (
            <Text style={styles.budgetNote}>
              + 5% עמלת פלטפורמה = {formatNIS((task.agreedPrice ?? task.budgetMax) * 1.05)}
            </Text>
          )}
        </View>

        {/* Client info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>המפרסם</Text>
          <UserRow user={task.client} label="לקוח" />
        </View>

        {/* Assigned Jester */}
        {task.jester && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>הג׳סטר</Text>
            <UserRow user={task.jester} label="ג׳סטר" />
          </View>
        )}

        {/* ── CLIENT ACTIONS ── */}
        {isOwner && task.status === 'OPEN' && task.offers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{task.offers.length} הצעות שהתקבלו</Text>
            {task.offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onAccept={() => handleAcceptOffer(offer.id, offer.jester.displayName)}
                isAccepted={offer.isAccepted}
              />
            ))}
          </View>
        )}

        {isOwner && task.status === 'PENDING_APPROVAL' && (
          <View style={styles.actionSection}>
            <Text style={styles.actionHint}>הג׳סטר סימן שסיים. אנא אשר את העבודה.</Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: Colors.success }]}
              onPress={() => handleStatusAction('approve')}
              disabled={actionLoading}
            >
              <Text style={styles.primaryButtonText}>✓ {he.tasks.approve_completion}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.disputeButton}
              onPress={() => setShowDisputeModal(true)}
            >
              <Text style={styles.disputeButtonText}>{he.tasks.open_dispute}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── JESTER ACTIONS (open task) ── */}
        {isOpenJester && (
          <View style={styles.actionSection}>
            {hasMyOffer ? (
              <Text style={styles.actionHint}>✓ שלחת הצעה — ממתינים ללקוח.</Text>
            ) : (
              <>
                {showOfferForm ? (
                  <OfferForm
                    price={offerPrice}
                    message={offerMessage}
                    onPriceChange={setOfferPrice}
                    onMessageChange={setOfferMessage}
                    onSubmit={handleSubmitOffer}
                    onCancel={() => setShowOfferForm(false)}
                    isLoading={actionLoading}
                    budgetMax={task.budgetMax}
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => setShowOfferForm(true)}
                  >
                    <Text style={styles.primaryButtonText}>💼 הגש הצעה</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* ── JESTER ACTIONS (assigned) ── */}
        {isAssignedJester && (
          <View style={styles.actionSection}>
            {task.status === 'ASSIGNED' && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => handleStatusAction('start')}
                disabled={actionLoading}
              >
                <Text style={styles.primaryButtonText}>▶ התחל לעבוד</Text>
              </TouchableOpacity>
            )}
            {task.status === 'IN_PROGRESS' && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: Colors.success }]}
                onPress={() => handleStatusAction('complete')}
                disabled={actionLoading}
              >
                <Text style={styles.primaryButtonText}>✓ סיימתי!</Text>
              </TouchableOpacity>
            )}
            {task.status === 'PENDING_APPROVAL' && (
              <Text style={styles.actionHint}>ממתינים לאישור הלקוח...</Text>
            )}
            {['IN_PROGRESS', 'ASSIGNED'].includes(task.status) && (
              <TouchableOpacity style={styles.disputeButton} onPress={() => setShowDisputeModal(true)}>
                <Text style={styles.disputeButtonText}>{he.tasks.open_dispute}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* Dispute Modal */}
      <Modal visible={showDisputeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>פתח מחלוקת</Text>
            <Text style={styles.modalSubtitle}>
              פרט מה הבעיה. צוות ג׳סטה יחזור אליך תוך 48 שעות.
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="פרט את הסיבה לפחות 10 תווים..."
              multiline
              numberOfLines={4}
              textAlign="right"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleDispute}
                disabled={actionLoading}
              >
                <Text style={styles.primaryButtonText}>שלח</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowDisputeModal(false)}
              >
                <Text style={styles.cancelButtonText}>{he.common.cancel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    OPEN:             { label: he.tasks.task_status_open,      color: Colors.primary },
    ASSIGNED:         { label: he.tasks.task_status_assigned,  color: Colors.warning },
    IN_PROGRESS:      { label: he.tasks.task_status_in_progress, color: Colors.accent },
    PENDING_APPROVAL: { label: he.tasks.task_status_pending,   color: Colors.warning },
    COMPLETED:        { label: he.tasks.task_status_completed, color: Colors.success },
    DISPUTED:         { label: he.tasks.task_status_disputed,  color: Colors.error },
  };
  const s = statusMap[status] ?? { label: status, color: Colors.textSecondary };
  return (
    <View style={[styles.statusChip, { backgroundColor: s.color + '20', borderColor: s.color }]}>
      <Text style={[styles.statusChipText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function UserRow({ user, label }: { user: any; label: string }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userInfo}>
        <View style={[styles.trustBadge, { backgroundColor: trustScoreColor(user.trustScore) + '20' }]}>
          <Text style={[styles.trustScore, { color: trustScoreColor(user.trustScore) }]}>
            {Math.round(user.trustScore)}
          </Text>
        </View>
        <View>
          <Text style={styles.userName}>{user.displayName}</Text>
          <Text style={styles.userVerification}>{user.verificationLevel}</Text>
        </View>
      </View>
      <Text style={styles.userLabel}>{label}</Text>
    </View>
  );
}

function OfferCard({ offer, onAccept, isAccepted }: { offer: Offer; onAccept: () => void; isAccepted: boolean }) {
  return (
    <View style={[styles.offerCard, isAccepted && styles.offerCardAccepted]}>
      <View style={styles.offerTop}>
        <Text style={styles.offerPrice}>{offer.price ? formatNIS(offer.price) : '—'}</Text>
        <Text style={styles.offerJester}>{offer.jester.displayName}</Text>
      </View>
      {offer.message && <Text style={styles.offerMessage}>{offer.message}</Text>}
      <View style={styles.offerBottom}>
        {!isAccepted && (
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptButtonText}>✓ קבל הצעה</Text>
          </TouchableOpacity>
        )}
        {isAccepted && <Text style={styles.acceptedBadge}>✓ הצעה שהתקבלה</Text>}
        <Text style={styles.offerTime}>{formatRelativeTime(new Date(offer.createdAt))}</Text>
      </View>
    </View>
  );
}

function OfferForm({ price, message, onPriceChange, onMessageChange, onSubmit, onCancel, isLoading, budgetMax }: any) {
  return (
    <View style={styles.offerForm}>
      <Text style={styles.sectionTitle}>הגש הצעת מחיר</Text>
      <Text style={styles.fieldLabel}>המחיר שלך (₪)</Text>
      <TextInput
        style={styles.textInput}
        value={price}
        onChangeText={onPriceChange}
        placeholder={`עד ${formatNIS(budgetMax)}`}
        keyboardType="numeric"
        textAlign="right"
      />
      <Text style={styles.fieldLabel}>הודעה ללקוח (אופציונלי)</Text>
      <TextInput
        style={[styles.textInput, { minHeight: 80 }]}
        value={message}
        onChangeText={onMessageChange}
        placeholder="למה אתה הג׳סטר הנכון?"
        multiline
        textAlign="right"
      />
      {price && (
        <Text style={styles.feeNote}>
          תקבל: {formatNIS(parseFloat(price) * 0.85)} (אחרי עמלה של 15%)
        </Text>
      )}
      <TouchableOpacity style={styles.primaryButton} onPress={onSubmit} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.primaryButtonText}>שלח הצעה</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>{he.common.cancel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { padding: Spacing.sm },
  backText: { fontSize: 20, color: Colors.textSecondary },
  scroll: { flex: 1 },
  titleBlock: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  categoryTag: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl', lineHeight: 29, marginBottom: Spacing.sm },
  address: { ...Typography.bodySmall, color: Colors.textSecondary },
  scheduled: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 4 },
  section: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sectionTitle: { ...Typography.label, marginBottom: Spacing.sm },
  description: { ...Typography.body, color: Colors.textSecondary, lineHeight: 24 },
  priceBlock: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: Spacing.md,
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg, marginVertical: Spacing.sm,
  },
  priceRow: { alignItems: 'flex-end' },
  priceLabel: { ...Typography.caption, color: Colors.textSecondary },
  priceValue: { fontSize: 28, fontWeight: '900', color: Colors.primary },
  budgetNote: { ...Typography.caption, color: Colors.textSecondary },
  userRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md, padding: 14,
  },
  userInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: Spacing.sm },
  trustBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  trustScore: { ...Typography.label },
  userName: { ...Typography.label },
  userVerification: { ...Typography.caption, color: Colors.textSecondary },
  userLabel: { ...Typography.caption, color: Colors.textSecondary },
  offerCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  offerCardAccepted: { borderColor: Colors.success, backgroundColor: '#E8F5E9' },
  offerTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: Spacing.sm },
  offerPrice: { ...Typography.h3, color: Colors.primary },
  offerJester: { ...Typography.label },
  offerMessage: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.sm },
  offerBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  offerTime: { ...Typography.caption, color: Colors.textDisabled },
  acceptButton: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.md,
    paddingVertical: 7, borderRadius: BorderRadius.pill,
  },
  acceptButtonText: { fontSize: 13, color: Colors.textInverse, fontWeight: '700' },
  acceptedBadge: { ...Typography.bodySmall, color: Colors.success, fontWeight: '700' },
  actionSection: { padding: Spacing.lg, gap: Spacing.sm },
  actionHint: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.sm },
  primaryButton: {
    backgroundColor: Colors.primary, paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.pill, alignItems: 'center', ...Shadows.sm,
  },
  primaryButtonText: { ...Typography.button, color: Colors.textInverse },
  disputeButton: { alignItems: 'center', paddingVertical: Spacing.sm },
  disputeButtonText: { ...Typography.bodySmall, color: Colors.error, textDecorationLine: 'underline' },
  offerForm: { gap: Spacing.sm },
  fieldLabel: { ...Typography.label, textAlign: 'right' },
  textInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    ...Typography.body,
  },
  textArea: { textAlignVertical: 'top' },
  feeNote: { ...Typography.bodySmall, color: Colors.success, textAlign: 'right', fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelButtonText: { ...Typography.body, color: Colors.textSecondary },
  statusChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: BorderRadius.pill, borderWidth: 1.5 },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { ...Typography.body, color: Colors.error },
  backLink: { ...Typography.body, color: Colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.background, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, gap: Spacing.md,
  },
  modalTitle: { ...Typography.h3 },
  modalSubtitle: { ...Typography.body, color: Colors.textSecondary },
  modalActions: { gap: Spacing.sm },
});
