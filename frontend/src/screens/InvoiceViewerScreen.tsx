/**
 * @file InvoiceViewerScreen.tsx
 * @description View, share, and download Israeli חשבונית ירוקה (green invoice).
 *
 * Features:
 *  - Invoice header with Jesta logo and invoice number
 *  - Full fee breakdown with VAT (מע"מ 17%)
 *  - Parties: client info, jester info
 *  - PDF download via Linking.openURL
 *  - Share invoice via React Native Share
 *  - Compliance notice (Israeli Tax Authority requirements)
 *
 * @hebrew מסך צפייה בחשבונית ירוקה — לקוח וג׳סטר יכולים לראות ולהוריד
 * @compliance חשבונית מס קבלה per Israeli tax law — includes 17% VAT on Jesta's commission
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { Colors, Typography, Spacing, BorderRadius, Shadows, formatNIS, formatDate } from '../theme/rtl';
import { useAuthContext } from '../hooks/useAuth';
import { api } from '../services/api';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type RootStackParamList = {
  InvoiceViewer: { transactionId: string };
  TaskDetail: { taskId: string };
};

type InvoiceRouteProp = RouteProp<RootStackParamList, 'InvoiceViewer'>;
type NavProp = StackNavigationProp<RootStackParamList>;

interface InvoiceData {
  invoiceNumber: string;
  pdfUrl: string;
  totalAmount: number;
  vatAmount: number;
  issuedAt: string;
  issuedAtHe: string;
  provider: 'MORNING' | 'ICOUNT';
}

interface TransactionDetails {
  id: string;
  status: string;
  statusHe: string;
  createdAt: string;
  fees: {
    agreedPrice: number;
    clientCommission: number;
    jesterCommission: number;
    insuranceMarkup: number;
    grossAmount: number;
    netToJester: number;
    jestaRevenue: number;
    vatAmount: number;
  };
  task: { id: string; title: string; category: string };
  client: { displayName: string | null; phone: string };
  jester: { displayName: string | null; phone: string };
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function InvoiceViewerScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<InvoiceRouteProp>();
  // Auth token auto-injected by api.ts

  const { transactionId } = route.params;

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────
  // Fetch invoice + transaction
  // ─────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [invoiceData, txnData] = await Promise.all([
          api.get<InvoiceData>(`/payments/${transactionId}/invoice`),
          api.get<{ transaction: TransactionDetails }>(`/payments/${transactionId}`),
        ]);
        setInvoice(invoiceData);
        setTransaction(txnData.transaction);
      } catch (err) {
        setError('לא ניתן לטעון את החשבונית. נסה שוב.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [transactionId]);

  // ─────────────────────────────
  // Actions
  // ─────────────────────────────

  const handleDownloadPdf = async () => {
    if (!invoice?.pdfUrl) return;
    try {
      await Linking.openURL(invoice.pdfUrl);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לפתוח את ה-PDF');
    }
  };

  const handleShare = async () => {
    if (!invoice) return;
    try {
      await Share.share({
        title: `חשבונית ג׳סטה ${invoice.invoiceNumber}`,
        message: `חשבונית מס קבלה מספר ${invoice.invoiceNumber}\nסכום: ${formatNIS(invoice.totalAmount)}\nהורד: ${invoice.pdfUrl}`,
        url: invoice.pdfUrl,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  // ─────────────────────────────
  // Loading / error states
  // ─────────────────────────────

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>טוען חשבונית...</Text>
      </View>
    );
  }

  if (error || !invoice || !transaction) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorEmoji}>📄</Text>
        <Text style={styles.errorTitle}>חשבונית לא זמינה</Text>
        <Text style={styles.errorBody}>{error ?? 'החשבונית תיווצר לאחר השלמת העסקה'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fees = transaction.fees;
  const commissionPreVat = fees.jestaRevenue - fees.vatAmount;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>→</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>חשבונית</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Text style={styles.shareIcon}>⬆️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Invoice document */}
        <View style={styles.invoiceDoc}>
          {/* Invoice header */}
          <View style={styles.invoiceHeader}>
            <View style={styles.invoiceHeaderRight}>
              <Text style={styles.companyName}>ג׳סטה טכנולוגיות בע"מ</Text>
              <Text style={styles.companyDetail}>ח.פ. 515xxxxxx</Text>
              <Text style={styles.companyDetail}>מע"מ מורשה</Text>
            </View>
            <View style={styles.invoiceHeaderLeft}>
              <View style={styles.invoiceBadge}>
                <Text style={styles.invoiceBadgeText}>חשבונית מס קבלה</Text>
              </View>
              <Text style={styles.invoiceNumber}>מס׳ {invoice.invoiceNumber}</Text>
              <Text style={styles.invoiceDate}>תאריך: {invoice.issuedAtHe}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Parties */}
          <View style={styles.partiesSection}>
            <View style={styles.partyBlock}>
              <Text style={styles.partyLabel}>לכבוד (לקוח)</Text>
              <Text style={styles.partyName}>{transaction.client.displayName ?? 'לקוח'}</Text>
              <Text style={styles.partyPhone}>{transaction.client.phone}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Line items */}
          <View style={styles.lineItemsSection}>
            <Text style={styles.lineItemsTitle}>פירוט שירות</Text>

            {/* Service description */}
            <View style={styles.lineItem}>
              <View style={styles.lineItemDesc}>
                <Text style={styles.lineItemName}>
                  שירות תיווך — {transaction.task?.title}
                </Text>
                <Text style={styles.lineItemSub}>
                  ג׳סטר: {transaction.jester?.displayName ?? 'ג׳סטר'}
                </Text>
              </View>
              <Text style={styles.lineItemAmount}>{formatNIS(commissionPreVat)}</Text>
            </View>

            {/* Insurance if applicable */}
            {fees.insuranceMarkup > 0 && (
              <View style={styles.lineItem}>
                <View style={styles.lineItemDesc}>
                  <Text style={styles.lineItemName}>ביטוח נהג זמני</Text>
                </View>
                <Text style={styles.lineItemAmount}>{formatNIS(fees.insuranceMarkup)}</Text>
              </View>
            )}

            {/* VAT */}
            <View style={[styles.lineItem, styles.vatRow]}>
              <View style={styles.lineItemDesc}>
                <Text style={styles.vatLabel}>מע"מ 17%</Text>
                <Text style={styles.vatNote}>על עמלת הפלטפורמה בלבד</Text>
              </View>
              <Text style={styles.vatAmount}>{formatNIS(fees.vatAmount)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Totals */}
          <View style={styles.totalsSection}>
            <TotalRow label={'לפני מע"מ'} value={formatNIS(commissionPreVat)} />
            <TotalRow label='מע"מ (17%)' value={formatNIS(fees.vatAmount)} />
            <View style={styles.totalFinalRow}>
              <Text style={styles.totalFinalLabel}>סה"כ לתשלום (כולל מע"מ)</Text>
              <Text style={styles.totalFinalValue}>{formatNIS(invoice.totalAmount)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Task summary (informational, not on invoice) */}
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>פרטי העסקה (לידיעה)</Text>
            <InfoRow label="מחיר מוסכם (ישירות לג׳סטר)" value={formatNIS(fees.agreedPrice)} />
            <InfoRow label="עמלת לקוח" value={formatNIS(fees.clientCommission)} />
            <InfoRow label="עמלת ג׳סטר" value={formatNIS(fees.jesterCommission)} />
            <InfoRow label="הג׳סטר קיבל" value={formatNIS(fees.netToJester)} highlight />
            <Text style={styles.infoNote}>
              * הסכום ישירות לג׳סטר אינו חלק מחשבונית ג׳סטה — זו עסקה ישירה בין הצדדים.
            </Text>
          </View>

          {/* Legal footer */}
          <View style={styles.legalFooter}>
            <Text style={styles.legalText}>
              מסמך זה הינו חשבונית מס קבלה לפי תקנות מס ערך מוסף. הופק ע"י {invoice.provider === 'MORNING' ? 'Morning (חשבונית ירוקה)' : 'iCount'}. נשמר במאגר מס הכנסה.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadPdf} activeOpacity={0.85}>
          <Text style={styles.downloadBtnText}>📥 הורד PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
          <Text style={styles.shareBtnText}>שתף</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={totalStyles.row}>
      <Text style={totalStyles.label}>{label}</Text>
      <Text style={totalStyles.value}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, highlight && { color: Colors.secondary, fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { ...Typography.body, color: Colors.textMuted, marginTop: 12 },
  errorEmoji: { fontSize: 52, marginBottom: 16 },
  errorTitle: { ...Typography.h3, color: Colors.text, textAlign: 'center', marginBottom: 8 },
  errorBody: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginBottom: 24 },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryBtnText: { ...Typography.button, color: 'white' },

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
  shareButton: {
    width: 36,
    height: 36,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIcon: { fontSize: 16 },

  scroll: { flex: 1 },

  // Invoice document
  invoiceDoc: {
    margin: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.modal,
  },

  invoiceHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.primaryLight,
  },
  invoiceHeaderRight: { alignItems: 'flex-end' },
  companyName: { fontSize: 16, fontWeight: '800', color: Colors.primary, textAlign: 'right', marginBottom: 4 },
  companyDetail: { fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
  invoiceHeaderLeft: { alignItems: 'flex-start' },
  invoiceBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  invoiceBadgeText: { fontSize: 11, color: 'white', fontWeight: '700' },
  invoiceNumber: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  invoiceDate: { fontSize: 11, color: Colors.textMuted },

  divider: { height: 1, backgroundColor: Colors.border },

  // Parties
  partiesSection: { padding: Spacing.md },
  partyBlock: { marginBottom: 8 },
  partyLabel: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginBottom: 4 },
  partyName: { ...Typography.bodyBold, color: Colors.text, textAlign: 'right' },
  partyPhone: { fontSize: 12, color: Colors.textMuted, textAlign: 'right' },

  // Line items
  lineItemsSection: { padding: Spacing.md },
  lineItemsTitle: { ...Typography.bodyBold, color: Colors.text, textAlign: 'right', marginBottom: 12 },
  lineItem: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface,
  },
  lineItemDesc: { flex: 1, alignItems: 'flex-end', paddingLeft: 8 },
  lineItemName: { ...Typography.body, color: Colors.text, textAlign: 'right' },
  lineItemSub: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  lineItemAmount: { ...Typography.bodyBold, color: Colors.text },

  vatRow: { backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: 8 },
  vatLabel: { ...Typography.body, color: Colors.textMuted, textAlign: 'right' },
  vatNote: { fontSize: 10, color: Colors.textLight, textAlign: 'right', marginTop: 2 },
  vatAmount: { ...Typography.body, color: Colors.textMuted },

  // Totals
  totalsSection: { padding: Spacing.md },
  totalFinalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: Colors.primary,
  },
  totalFinalLabel: { ...Typography.bodyBold, color: Colors.text },
  totalFinalValue: { fontSize: 20, fontWeight: '900', color: Colors.primary },

  // Info section
  infoSection: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  infoTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textAlign: 'right', marginBottom: 10 },
  infoNote: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: 10, lineHeight: 16 },

  // Legal footer
  legalFooter: {
    padding: Spacing.md,
    backgroundColor: '#F1F5F9',
  },
  legalText: { fontSize: 10, color: Colors.textLight, textAlign: 'center', lineHeight: 16 },

  // Bottom actions
  footer: {
    flexDirection: 'row-reverse',
    padding: Spacing.md,
    paddingBottom: 32,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  downloadBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    padding: 15,
    alignItems: 'center',
    ...Shadows.button,
  },
  downloadBtnText: { ...Typography.button, color: 'white' },
  shareBtn: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    padding: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  shareBtnText: { ...Typography.button, color: Colors.text },
});

const totalStyles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 5 },
  label: { ...Typography.body, color: Colors.textMuted },
  value: { ...Typography.body, color: Colors.text },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: 12, color: Colors.textMuted },
  value: { fontSize: 12, color: Colors.text, fontWeight: '600' },
});
