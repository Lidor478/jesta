/**
 * @file TransactionHistoryScreen.tsx
 * @description Transaction history for clients (spending) and jesters (earnings).
 *
 * Features:
 *  - Role toggle: "כלקוח" (client spending) vs "כג׳סטר" (jester earnings)
 *  - Status filter chips (all / held / released / disputed / refunded)
 *  - Summary stats bar: total earned/spent, completed tasks
 *  - Infinite scroll via cursor pagination
 *  - Each card: task title, date, status chip, amount, invoice download link
 *
 * @hebrew היסטוריית עסקאות — לקוח רואה הוצאות, ג׳סטר רואה הכנסות
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows, formatNIS, formatDate } from '../theme/rtl';
import { useAuthContext } from '../hooks/useAuth';
import { api } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import he from '../i18n/he.json';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type NavProp = StackNavigationProp<any>;

type TransactionStatus = 'PENDING' | 'HELD' | 'RELEASED' | 'REFUNDED' | 'DISPUTED';
type UserRole = 'CLIENT' | 'JESTER';

interface TransactionItem {
  id: string;
  status: TransactionStatus;
  statusHe: string;
  agreedPrice: number;
  grossAmount: number;
  netToJester: number;
  flaggedForCashLaw: boolean;
  heldAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  task: {
    id: string;
    title: string;
    category: string;
  };
  invoice?: {
    invoiceNumber: string;
    pdfUrl: string;
  } | null;
}

interface Stats {
  totalEarned: number;
  totalSpent: number;
  completedCount: number;
}

const STATUS_COLORS: Record<TransactionStatus, { bg: string; text: string; border: string }> = {
  PENDING:  { bg: '#F1F5F9', text: '#64748B', border: '#CBD5E1' },
  HELD:     { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  RELEASED: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  REFUNDED: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  DISPUTED: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
};

const CATEGORY_EMOJI: Record<string, string> = {
  DRIVING: '🚗',
  CLEANING: '🧹',
  MOVING: '📦',
  ERRANDS: '🛍️',
  TECH_HELP: '💻',
  ELDER_CARE: '👴',
  OTHER: '✨',
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function TransactionHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthContext();

  const [role, setRole] = useState<UserRole>('JESTER');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'ALL'>('ALL');
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [stats, setStats] = useState<Stats>({ totalEarned: 0, totalSpent: 0, completedCount: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const abortRef = useRef<AbortController | null>(null);

  // ─────────────────────────────
  // Fetch transactions
  // ─────────────────────────────

  const fetchTransactions = useCallback(
    async (cursor?: string, reset = false) => {
      if (loading && !reset) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        setLoading(true);

        const params = new URLSearchParams({
          role,
          ...(statusFilter !== 'ALL' && { status: statusFilter }),
          limit: '20',
          ...(cursor && { cursor }),
        });

        const data = await api.get<{
          transactions?: TransactionItem[];
          stats?: Stats;
          nextCursor?: string | null;
        }>(`/payments/mine?${params}`);

        const newTxns: TransactionItem[] = data.transactions ?? [];
        setStats(data.stats ?? { totalEarned: 0, totalSpent: 0, completedCount: 0 });
        setNextCursor(data.nextCursor ?? null);
        setHasMore(!!data.nextCursor);
        setTransactions(prev => reset ? newTxns : [...prev, ...newTxns]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('[TXN_HISTORY] fetch error:', err);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role, statusFilter, loading],
  );

  useEffect(() => {
    setTransactions([]);
    setNextCursor(null);
    setHasMore(true);
    fetchTransactions(undefined, true);
  }, [role, statusFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTransactions([]);
    setNextCursor(null);
    fetchTransactions(undefined, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading && nextCursor) {
      fetchTransactions(nextCursor);
    }
  };

  // ─────────────────────────────
  // Render transaction card
  // ─────────────────────────────

  const renderTransaction = ({ item }: { item: TransactionItem }) => {
    const colors = STATUS_COLORS[item.status];
    const emoji = CATEGORY_EMOJI[item.task?.category] ?? '✨';
    const amount = role === 'JESTER' ? item.netToJester : item.grossAmount;
    const sign = role === 'JESTER' ? '+' : '-';
    const amountColor = role === 'JESTER' ? Colors.secondary : Colors.danger;

    return (
      <TouchableOpacity
        style={styles.txnCard}
        onPress={() => navigation.navigate('TaskDetail', { taskId: item.task?.id })}
        activeOpacity={0.8}
      >
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={[styles.statusChip, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[styles.statusText, { color: colors.text }]}>{item.statusHe}</Text>
          </View>
          <Text style={[styles.amount, { color: amountColor }]}>
            {sign}{formatNIS(amount)}
          </Text>
        </View>

        {/* Task title */}
        <Text style={styles.taskTitle} numberOfLines={1}>
          {emoji} {item.task?.title ?? 'משימה'}
        </Text>

        {/* Bottom row */}
        <View style={styles.cardBottom}>
          <Text style={styles.dateText}>{formatDate(new Date(item.createdAt))}</Text>
          <View style={styles.cardActions}>
            {item.flaggedForCashLaw && (
              <View style={styles.cashLawBadge}>
                <Text style={styles.cashLawBadgeText}>⚠️ חוק מזומן</Text>
              </View>
            )}
            {item.invoice?.pdfUrl && (
              <TouchableOpacity
                style={styles.invoiceBtn}
                onPress={() => Linking.openURL(item.invoice!.pdfUrl)}
              >
                <Text style={styles.invoiceBtnText}>📄 חשבונית</Text>
              </TouchableOpacity>
            )}
            {item.status === 'HELD' && role === 'CLIENT' && (
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => navigation.navigate('TaskDetail', { taskId: item.task?.id })}
              >
                <Text style={styles.approveBtnText}>✓ אשר השלמה</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Held timer */}
        {item.status === 'HELD' && item.heldAt && (
          <HoldTimer heldAt={new Date(item.heldAt)} />
        )}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loading || refreshing) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={56} color={Colors.textDisabled} style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>{he.transactions.empty_title}</Text>
        <Text style={styles.emptyBody}>{he.transactions.empty_body}</Text>
        <TouchableOpacity
          style={styles.emptyCta}
          onPress={() => navigation.navigate('HomeFeed')}
        >
          <Text style={styles.emptyCtaText}>{he.transactions.empty_cta}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─────────────────────────────
  // Main render
  // ─────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={{ paddingTop: 40 }}>
        <ScreenHeader title="היסטוריית עסקאות" onBack={() => navigation.goBack()} />
      </View>

      {/* Role toggle */}
      <View style={styles.roleToggle}>
        <TouchableOpacity
          style={[styles.roleBtn, role === 'JESTER' && styles.roleBtnActive]}
          onPress={() => setRole('JESTER')}
        >
          <Text style={[styles.roleBtnText, role === 'JESTER' && styles.roleBtnTextActive]}>
            💼 כג׳סטר
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleBtn, role === 'CLIENT' && styles.roleBtnActive]}
          onPress={() => setRole('CLIENT')}
        >
          <Text style={[styles.roleBtnText, role === 'CLIENT' && styles.roleBtnTextActive]}>
            🛒 כלקוח
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <StatBox
          label={role === 'JESTER' ? 'הכנסות' : 'הוצאות'}
          value={formatNIS(role === 'JESTER' ? stats.totalEarned : stats.totalSpent)}
          color={role === 'JESTER' ? Colors.secondary : Colors.primary}
        />
        <View style={styles.statsDivider} />
        <StatBox
          label="משימות הושלמו"
          value={String(stats.completedCount)}
          color={Colors.text}
        />
        {role === 'JESTER' && (
          <>
            <View style={styles.statsDivider} />
            <StatBox
              label="ממוצע למשימה"
              value={stats.completedCount > 0 ? formatNIS(stats.totalEarned / stats.completedCount) : '—'}
              color={Colors.textMuted}
            />
          </>
        )}
      </View>

      {/* Status filter pills */}
      <View style={styles.filterRow}>
        {(['ALL', 'HELD', 'RELEASED', 'DISPUTED', 'REFUNDED'] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterPill, statusFilter === s && styles.filterPillActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterPillText, statusFilter === s && styles.filterPillTextActive]}>
              {s === 'ALL' ? 'הכל' : s === 'HELD' ? 'מוחזק' : s === 'RELEASED' ? 'שולם' : s === 'DISPUTED' ? 'מחלוקת' : 'הוחזר'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={renderTransaction}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// HoldTimer — shows days remaining until auto-release
// ─────────────────────────────────────────────

function HoldTimer({ heldAt }: { heldAt: Date }) {
  const HOLD_DAYS = 7;
  const elapsed = (Date.now() - heldAt.getTime()) / (1000 * 60 * 60 * 24);
  const remaining = Math.max(0, HOLD_DAYS - elapsed);
  const pct = Math.min(100, (elapsed / HOLD_DAYS) * 100);

  return (
    <View style={timerStyles.wrap}>
      <View style={timerStyles.row}>
        <Text style={timerStyles.label}>
          שחרור אוטומטי בעוד {Math.ceil(remaining)} ימים
        </Text>
        <Text style={timerStyles.pct}>{Math.round(pct)}%</Text>
      </View>
      <View style={timerStyles.bar}>
        <View style={[timerStyles.fill, { width: `${pct}%` as any }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// StatBox
// ─────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={statStyles.box}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

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
  headerTitle: { ...Typography.h3, color: Colors.text },

  // Role toggle
  roleToggle: {
    flexDirection: 'row-reverse',
    margin: Spacing.md,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  roleBtn: { flex: 1, padding: 10, borderRadius: BorderRadius.sm - 1, alignItems: 'center' },
  roleBtnActive: { backgroundColor: Colors.background, ...Shadows.card },
  roleBtnText: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600' },
  roleBtnTextActive: { color: Colors.text, fontWeight: '800' },

  // Stats bar
  statsBar: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.background,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  statsDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 12 },

  // Filter
  filterRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.md,
    gap: 6,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  filterPillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  filterPillText: { ...Typography.caption, color: Colors.textMuted },
  filterPillTextActive: { color: Colors.primary, fontWeight: '700' },

  // List
  listContent: { padding: Spacing.md, gap: 10 },

  // Transaction card
  txnCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 20, fontWeight: '900' },
  taskTitle: { ...Typography.body, color: Colors.text, textAlign: 'right', marginBottom: 10, fontWeight: '600' },
  cardBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { ...Typography.caption, color: Colors.textLight },
  cardActions: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },

  cashLawBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cashLawBadgeText: { fontSize: 10, color: '#92400E', fontWeight: '700' },

  invoiceBtn: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  invoiceBtnText: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },

  approveBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  approveBtnText: { ...Typography.caption, color: 'white', fontWeight: '700' },

  // Footer loader
  footerLoader: { padding: 20, alignItems: 'center' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { ...Typography.h3, color: Colors.text, textAlign: 'center', marginBottom: 8 },
  emptyBody: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  emptyCta: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: BorderRadius.pill,
  },
  emptyCtaText: { ...Typography.button, color: 'white' },
});

const timerStyles = StyleSheet.create({
  wrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 5 },
  label: { ...Typography.caption, color: Colors.textMuted },
  pct: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
  bar: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  fill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
});

const statStyles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center' },
  value: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  label: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
});
