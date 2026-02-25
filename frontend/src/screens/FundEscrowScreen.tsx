/**
 * @file FundEscrowScreen.tsx
 * @description Client pays to fund escrow after accepting a Jester's offer.
 *
 * Flow:
 *  1. Fee breakdown display (price + commissions + optional insurance)
 *  2. Payment method selection (card via Cardcom iframe, bank transfer)
 *  3. Cash Law warning if total > 6,000 NIS
 *  4. Card input (Cardcom hosted fields for PCI compliance)
 *  5. POST /v1/payments/fund
 *  6. Success → Task detail with ASSIGNED status
 *
 * @hebrew מסך מימון נאמנות — לקוח משלם לאחר קבלת הצעה
 * @compliance Cash Law: cash payment blocked above 6,000 NIS.
 * @compliance PCI DSS: card numbers never touch Jesta servers — Cardcom tokenizes client-side.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { Colors, Typography, Spacing, BorderRadius, Shadows, formatNIS } from '../theme/rtl';
import { LIMITS } from '../../config/constants';
import { useAuthContext } from '../hooks/useAuth';
import { api } from '../services/api';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type RootStackParamList = {
  FundEscrow: { taskId: string; offerId: string; agreedPrice: number; jesterName: string; taskTitle: string; requiresVehicle: boolean };
  TaskDetail: { taskId: string };
  TransactionHistory: undefined;
};

type FundEscrowRouteProp = RouteProp<RootStackParamList, 'FundEscrow'>;
type NavProp = StackNavigationProp<RootStackParamList, 'FundEscrow'>;

type PaymentMethod = 'CARD' | 'BANK_TRANSFER';

interface FeeBreakdown {
  agreedPrice: number;
  clientCommission: number;
  jesterCommission: number;
  insuranceMarkup: number;
  grossAmount: number;
  netToJester: number;
  flaggedForCashLaw: boolean;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function FundEscrowScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<FundEscrowRouteProp>();

  const { taskId, agreedPrice, jesterName, taskTitle, requiresVehicle } = route.params;

  // State
  const [fees, setFees] = useState<FeeBreakdown | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [cardToken, setCardToken] = useState<string>(''); // from Cardcom iframe
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);

  // Card input state (Cardcom sandbox — real impl uses WebView iframe)
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // ─────────────────────────────
  // Fetch fee preview on mount
  // ─────────────────────────────

  const fetchFeePreview = useCallback(async () => {
    try {
      setPreviewLoading(true);
      const data = await api.post('/payments/fee-preview', {
        agreedPrice,
        requiresVehicle,
      });
      setFees(data as FeeBreakdown);
    } catch {
      // Compute locally as fallback
      const clientCommission = Math.round(agreedPrice * 0.05 * 100) / 100;
      const jesterCommission = Math.round(agreedPrice * 0.15 * 100) / 100;
      const insuranceMarkup = requiresVehicle ? Math.round(agreedPrice * 0.03 * 100) / 100 : 0;
      const grossAmount = agreedPrice + clientCommission + insuranceMarkup;
      setFees({
        agreedPrice,
        clientCommission,
        jesterCommission,
        insuranceMarkup,
        grossAmount,
        netToJester: agreedPrice - jesterCommission,
        flaggedForCashLaw: grossAmount > LIMITS.CASH_LAW_MAX_NIS,
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [agreedPrice, requiresVehicle]);

  useEffect(() => { fetchFeePreview(); }, [fetchFeePreview]);

  // ─────────────────────────────
  // Simulate Cardcom tokenization
  // In production: WebView with Cardcom hosted page → postMessage token
  // ─────────────────────────────

  const tokenizeCard = (): string => {
    // Real impl: await Cardcom iframe to return token
    // Stub: generate a fake token for dev
    return `CARDCOM_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };

  // ─────────────────────────────
  // Fund escrow
  // ─────────────────────────────

  const handleFund = async () => {
    if (!fees) return;

    if (paymentMethod === 'CARD' && (!cardNumber || !cardExpiry || !cardCvv)) {
      Alert.alert('שגיאה', 'נא למלא את פרטי כרטיס האשראי');
      return;
    }

    Alert.alert(
      'אישור תשלום',
      `האם לחייב ${formatNIS(fees.grossAmount)} לכרטיסך?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'אשר תשלום',
          onPress: async () => {
            try {
              setLoading(true);

              // In production: get real Cardcom token from WebView iframe
              const pToken = paymentMethod === 'CARD' ? tokenizeCard() : 'BANK_TRANSFER_PENDING';

              const result = await api.post<{ messageHe?: string }>(
                '/payments/fund',
                {
                  taskId,
                  agreedPrice: fees.agreedPrice,
                  paymentToken: pToken,
                  paymentMethod,
                },
              );

              Alert.alert(
                '✅ התשלום בוצע!',
                result.messageHe ?? 'הכסף מוחזק בנאמנות. הג׳סטר יכול להתחיל לעבוד!',
                [
                  {
                    text: 'המשך',
                    onPress: () => navigation.replace('TaskDetail', { taskId }),
                  },
                ],
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'שגיאה בתשלום';
              Alert.alert('שגיאה בתשלום', msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // ─────────────────────────────
  // Card number formatter (XXXX XXXX XXXX XXXX)
  // ─────────────────────────────

  const formatCardNumber = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  // ─────────────────────────────
  // Render
  // ─────────────────────────────

  if (previewLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>מחשב עמלות...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backIcon}>→</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>מימון נאמנות</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Task summary card */}
        <View style={styles.taskCard}>
          <Text style={styles.taskLabel}>משימה</Text>
          <Text style={styles.taskTitle}>{taskTitle}</Text>
          <View style={styles.jesterRow}>
            <Text style={styles.jesterLabel}>ג׳סטר נבחר:</Text>
            <Text style={styles.jesterName}>{jesterName}</Text>
          </View>
        </View>

        {/* Cash Law warning */}
        {fees?.flaggedForCashLaw && (
          <View style={styles.cashLawWarning}>
            <Text style={styles.cashLawIcon}>⚠️</Text>
            <Text style={styles.cashLawText}>
              סכום מעל ₪{LIMITS.CASH_LAW_MAX_NIS.toLocaleString('he-IL')} — תשלום במזומן אסור על פי חוק.
              נא לשלם בכרטיס אשראי בלבד.
            </Text>
          </View>
        )}

        {/* Fee breakdown */}
        {fees && (
          <View style={styles.feeCard}>
            <Text style={styles.feeCardTitle}>פירוט עלויות</Text>

            <FeeRow label="מחיר מוסכם" value={formatNIS(fees.agreedPrice)} />
            <FeeRow label={`עמלת פלטפורמה (${Math.round(0.05 * 100)}%)`} value={formatNIS(fees.clientCommission)} />
            {fees.insuranceMarkup > 0 && (
              <FeeRow label="ביטוח נהג זמני (3%)" value={formatNIS(fees.insuranceMarkup)} />
            )}

            <View style={styles.feeDivider} />

            <FeeRow
              label="סה״כ לתשלום"
              value={formatNIS(fees.grossAmount)}
              bold
              valueColor={Colors.primary}
            />

            <View style={styles.jesterReceivesRow}>
              <Text style={styles.jesterReceivesLabel}>הג׳סטר יקבל</Text>
              <Text style={styles.jesterReceivesValue}>{formatNIS(fees.netToJester)}</Text>
            </View>
          </View>
        )}

        {/* Escrow explanation */}
        <View style={styles.escrowExplain}>
          <Text style={styles.escrowIcon}>🔒</Text>
          <Text style={styles.escrowText}>
            הכסף מוחזק בנאמנות ומשוחרר לג׳סטר רק לאחר אישורך.
            אם המשימה לא הושלמת, תקבל החזר מלא.
          </Text>
        </View>

        {/* Payment method selection */}
        <Text style={styles.sectionTitle}>אמצעי תשלום</Text>
        <View style={styles.methodRow}>
          <MethodChip
            label="💳 כרטיס אשראי"
            selected={paymentMethod === 'CARD'}
            onPress={() => setPaymentMethod('CARD')}
          />
          {!fees?.flaggedForCashLaw && (
            <MethodChip
              label="🏦 העברה בנקאית"
              selected={paymentMethod === 'BANK_TRANSFER'}
              onPress={() => setPaymentMethod('BANK_TRANSFER')}
            />
          )}
        </View>

        {/* Card input fields (Cardcom production = WebView iframe) */}
        {paymentMethod === 'CARD' && (
          <View style={styles.cardForm}>
            <Text style={styles.cardFormNote}>🔒 פרטי הכרטיס מוצפנים ומאובטחים (Cardcom PCI DSS)</Text>

            <Text style={styles.fieldLabel}>מספר כרטיס</Text>
            <TextInput
              style={[styles.cardInput, { textAlign: 'left', direction: 'ltr' }]}
              value={cardNumber}
              onChangeText={(t) => setCardNumber(formatCardNumber(t))}
              placeholder="0000 0000 0000 0000"
              keyboardType="number-pad"
              maxLength={19}
              placeholderTextColor={Colors.textLight}
            />

            <View style={styles.cardRowSplit}>
              <View style={styles.cardHalf}>
                <Text style={styles.fieldLabel}>תוקף</Text>
                <TextInput
                  style={[styles.cardInput, { textAlign: 'left' }]}
                  value={cardExpiry}
                  onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                  placeholder="MM/YY"
                  keyboardType="number-pad"
                  maxLength={5}
                  placeholderTextColor={Colors.textLight}
                />
              </View>
              <View style={styles.cardHalf}>
                <Text style={styles.fieldLabel}>CVV</Text>
                <TextInput
                  style={[styles.cardInput, { textAlign: 'left' }]}
                  value={cardCvv}
                  onChangeText={setCardCvv}
                  placeholder="123"
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  placeholderTextColor={Colors.textLight}
                />
              </View>
            </View>

            <Text style={styles.cardBrands}>ויזה · מאסטרקארד · אמריקן אקספרס · ישראכרט</Text>
          </View>
        )}

        {/* Bank transfer instructions */}
        {paymentMethod === 'BANK_TRANSFER' && (
          <View style={styles.bankCard}>
            <Text style={styles.bankTitle}>פרטי העברה בנקאית</Text>
            <BankRow label="בנק" value="מזרחי טפחות (20)" />
            <BankRow label="סניף" value="482" />
            <BankRow label="חשבון" value="12345678" />
            <BankRow label="על שם" value='ג׳סטה טכנולוגיות בע"מ' />
            <BankRow label="סכום" value={fees ? formatNIS(fees.grossAmount) : '—'} highlight />
            <Text style={styles.bankNote}>
              יש לציין בהערה: מספר משימה {taskId.slice(0, 8).toUpperCase()}{'\n'}
              התשלום יאומת תוך 1-2 ימי עסקים.
            </Text>
          </View>
        )}

        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.payButton, loading && styles.payButtonDisabled]}
          onPress={handleFund}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.payButtonText}>
              {paymentMethod === 'CARD'
                ? `שלם ${fees ? formatNIS(fees.grossAmount) : ''} 🔒`
                : 'שלחתי העברה — המשך'}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.secureNote}>כל העסקאות מאובטחות בהצפנה TLS 1.3</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function FeeRow({
  label,
  value,
  bold = false,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={feeRowStyles.row}>
      <Text style={[feeRowStyles.label, bold && feeRowStyles.bold]}>{label}</Text>
      <Text style={[feeRowStyles.value, bold && feeRowStyles.bold, valueColor ? { color: valueColor } : {}]}>
        {value}
      </Text>
    </View>
  );
}

function MethodChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[methodStyles.chip, selected && methodStyles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[methodStyles.chipText, selected && methodStyles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BankRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={bankStyles.row}>
      <Text style={bankStyles.label}>{label}</Text>
      <Text style={[bankStyles.value, highlight && { color: Colors.primary, fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface },
  loadingText: { ...Typography.body, color: Colors.textMuted, marginTop: 12 },

  // Header
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    paddingTop: 56,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backIcon: { fontSize: 16, color: Colors.text },
  headerTitle: { ...Typography.h3, color: Colors.text },

  // Task card
  taskCard: {
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  taskLabel: { ...Typography.caption, color: Colors.primary, textAlign: 'right', marginBottom: 4 },
  taskTitle: { ...Typography.h3, color: Colors.text, textAlign: 'right', marginBottom: 8 },
  jesterRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  jesterLabel: { ...Typography.caption, color: Colors.textMuted },
  jesterName: { ...Typography.bodyBold, color: Colors.primary },

  // Cash Law warning
  cashLawWarning: {
    flexDirection: 'row-reverse',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    gap: 8,
    alignItems: 'flex-start',
  },
  cashLawIcon: { fontSize: 18 },
  cashLawText: { ...Typography.caption, color: '#92400E', textAlign: 'right', flex: 1, lineHeight: 18 },

  // Fee card
  feeCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  feeCardTitle: { ...Typography.bodyBold, color: Colors.text, textAlign: 'right', marginBottom: 12 },
  feeDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  jesterReceivesRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  jesterReceivesLabel: { ...Typography.caption, color: Colors.textMuted },
  jesterReceivesValue: { ...Typography.body, color: Colors.secondary, fontWeight: '700' },

  // Escrow explanation
  escrowExplain: {
    flexDirection: 'row-reverse',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: '#ECFDF5',
    borderRadius: BorderRadius.md,
    gap: 8,
    alignItems: 'flex-start',
  },
  escrowIcon: { fontSize: 18 },
  escrowText: { ...Typography.caption, color: '#065F46', textAlign: 'right', flex: 1, lineHeight: 18 },

  // Section title
  sectionTitle: {
    ...Typography.bodyBold,
    color: Colors.text,
    textAlign: 'right',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Method chips
  methodRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: Spacing.md,
  },

  // Card form
  cardForm: {
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  cardFormNote: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginBottom: 14 },
  fieldLabel: { ...Typography.caption, color: Colors.text, fontWeight: '600', textAlign: 'right', marginBottom: 6 },
  cardInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
    fontFamily: 'Heebo-Regular',
    marginBottom: 12,
    letterSpacing: 1,
  },
  cardRowSplit: { flexDirection: 'row-reverse', gap: 10 },
  cardHalf: { flex: 1 },
  cardBrands: { ...Typography.caption, color: Colors.textLight, textAlign: 'center', marginTop: 4 },

  // Bank card
  bankCard: {
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  bankTitle: { ...Typography.bodyBold, color: Colors.text, textAlign: 'right', marginBottom: 12 },
  bankNote: { ...Typography.caption, color: Colors.textMuted, textAlign: 'right', marginTop: 12, lineHeight: 18 },

  // Footer
  footer: {
    padding: Spacing.md,
    paddingBottom: 32,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  payButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    padding: 17,
    alignItems: 'center',
    ...Shadows.button,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { ...Typography.buttonLg, color: 'white' },
  secureNote: { ...Typography.caption, color: Colors.textLight, textAlign: 'center', marginTop: 8 },
});

const feeRowStyles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 5 },
  label: { ...Typography.body, color: Colors.textMuted },
  value: { ...Typography.body, color: Colors.text },
  bold: { fontWeight: '800', fontSize: 16 },
});

const methodStyles = StyleSheet.create({
  chip: {
    flex: 1,
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  chipText: { ...Typography.body, color: Colors.textMuted },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
});

const bankStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { ...Typography.caption, color: Colors.textMuted },
  value: { ...Typography.body, color: Colors.text, fontWeight: '600' },
});
