/**
 * @file TaskFeedScreen.tsx
 * @description Nearby task feed for Jesters — the core discovery experience.
 *
 * Features:
 *   - Category filter pill bar (RTL)
 *   - Multi-factor relevance score badge
 *   - Pull-to-refresh + infinite scroll (cursor-based)
 *   - Distance in ק״מ
 *   - Community tasks section at the bottom
 *
 * @hebrew פיד משימות קרובות לג׳סטר — מיון לפי רלוונטיות ומיקום
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, SafeAreaView, StatusBar, ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  Colors, Typography, Spacing, BorderRadius, Shadows,
  formatNIS, formatDistance, formatRelativeTime, trustScoreColor,
} from '../theme/rtl';
import he from '../i18n/he.json';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortBy = 'relevance' | 'distance' | 'price';
type CategoryFilter = 'ALL' | 'DRIVING' | 'CLEANING' | 'MOVING' | 'ERRANDS' | 'TECH_HELP' | 'OTHER';

interface TaskCard {
  task: {
    id: string;
    title: string;
    category: string;
    budgetMax: number;
    address: string;
    scheduledAt: string | null;
    requiresVehicle: boolean;
    isCommunityTask: boolean;
    createdAt: string;
    client: { displayName: string; trustScore: number; verificationLevel: string };
    _offersCount: number;
  };
  score: number;
  distanceKm: number;
}

interface TaskFeedScreenProps {
  userLat: number;
  userLng: number;
  onTaskPress: (taskId: string) => void;
  onPostTask: () => void;
}

const CATEGORY_FILTERS: { key: CategoryFilter; emoji: string; label: string }[] = [
  { key: 'ALL',       emoji: '🌟', label: 'הכל' },
  { key: 'DRIVING',   emoji: '🚗', label: 'נסיעה' },
  { key: 'CLEANING',  emoji: '🧹', label: 'ניקיון' },
  { key: 'MOVING',    emoji: '📦', label: 'הובלה' },
  { key: 'ERRANDS',   emoji: '🛍️', label: 'שליחויות' },
  { key: 'TECH_HELP', emoji: '💻', label: 'טכנולוגיה' },
  { key: 'OTHER',     emoji: '✨', label: 'אחר' },
];

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'relevance', label: 'רלוונטיות' },
  { key: 'distance',  label: 'מרחק' },
  { key: 'price',     label: 'מחיר' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaskFeedScreen({
  userLat, userLng, onTaskPress, onPostTask,
}: TaskFeedScreenProps) {
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [communityTasks, setCommunityTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('relevance');

  const abortRef = useRef<AbortController>();

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (
    cursor?: string,
    category?: CategoryFilter,
    sort?: SortBy,
    refreshing = false
  ) => {
    if (refreshing) setIsRefreshing(true);
    else if (!cursor) setIsLoading(true);
    else setIsLoadingMore(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const token = await AsyncStorage.getItem('@jesta/access_token');
      const params = new URLSearchParams({
        lat: String(userLat),
        lng: String(userLng),
        sortBy: sort ?? sortBy,
        limit: '20',
        ...(cursor ? { cursor } : {}),
        ...(category && category !== 'ALL' ? { category } : {}),
      });

      const [feedRes, communityRes] = await Promise.all([
        fetch(`${process.env.EXPO_PUBLIC_API_URL}/v1/tasks/nearby?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortRef.current.signal,
        }),
        !cursor ? fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/v1/tasks/community?lat=${userLat}&lng=${userLng}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        ) : null,
      ]);

      const feedData = await feedRes.json();

      if (cursor) {
        setTasks((prev) => [...prev, ...feedData.tasks]);
      } else {
        setTasks(feedData.tasks ?? []);
      }
      setNextCursor(feedData.nextCursor ?? null);

      if (communityRes) {
        const communityData = await communityRes.json();
        setCommunityTasks(communityData.tasks ?? []);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('[TaskFeed]', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [userLat, userLng, sortBy]);

  useEffect(() => { fetchTasks(); }, []);

  const handleCategoryChange = (cat: CategoryFilter) => {
    setActiveCategory(cat);
    setNextCursor(null);
    fetchTasks(undefined, cat, sortBy);
  };

  const handleSortChange = (sort: SortBy) => {
    setSortBy(sort);
    setNextCursor(null);
    fetchTasks(undefined, activeCategory, sort);
  };

  const handleRefresh = () => fetchTasks(undefined, activeCategory, sortBy, true);

  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      fetchTasks(nextCursor, activeCategory, sortBy);
    }
  };

  // ─── Render Helpers ──────────────────────────────────────────────────────────

  const renderTaskCard = ({ item }: { item: TaskCard }) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => onTaskPress(item.task.id)}
      activeOpacity={0.8}
    >
      {/* Top row: title + distance */}
      <View style={styles.cardTopRow}>
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>{formatDistance(item.distanceKm)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.task.title}</Text>
      </View>

      {/* Category + vehicle badge */}
      <View style={styles.badgeRow}>
        {item.task.requiresVehicle && (
          <View style={[styles.badge, styles.badgeVehicle]}>
            <Text style={styles.badgeText}>🚗 נדרש רכב</Text>
          </View>
        )}
        <View style={[styles.badge, styles.badgeCategory]}>
          <Text style={styles.badgeText}>
            {(he.categories as any)[item.task.category]}
          </Text>
        </View>
      </View>

      {/* Client info + trust */}
      <View style={styles.clientRow}>
        <View style={styles.offersCount}>
          <Text style={styles.offersCountText}>{item.task._offersCount} הצעות</Text>
        </View>
        <View style={styles.clientInfo}>
          <View style={[styles.trustDot, { backgroundColor: trustScoreColor(item.task.client.trustScore) }]} />
          <Text style={styles.clientName}>{item.task.client.displayName}</Text>
        </View>
      </View>

      {/* Price + score */}
      <View style={styles.cardBottomRow}>
        <ScoreBadge score={item.score} />
        <Text style={styles.priceText}>{formatNIS(item.task.budgetMax)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderCommunityCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.taskCard, styles.communityCard]}
      onPress={() => onTaskPress(item.id)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.distanceBadge, { backgroundColor: Colors.communityBackground }]}>
          <Text style={[styles.distanceText, { color: Colors.secondary }]}>
            {formatDistance(item.distanceKm)}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      </View>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: Colors.communityBackground, borderColor: Colors.communityBorder }]}>
          <Text style={[styles.badgeText, { color: Colors.secondary }]}>❤️  חינם</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>+50 קארמה</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View>
      {/* Sort pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}>
        {SORT_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.sortChip, sortBy === key && styles.sortChipActive]}
            onPress={() => handleSortChange(key)}
          >
            <Text style={[styles.sortChipText, sortBy === key && styles.sortChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tasks.length === 0 && !isLoading && (
        <View style={styles.emptyState}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyTitle}>{he.home.no_tasks}</Text>
            <Text style={styles.emptySubtitle}>{he.home.be_first}</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={onPostTask}>
              <Text style={styles.emptyCtaText}>+ {he.tasks.post_task}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const ListFooter = () => (
    <View>
      {/* Community section */}
      {communityTasks.length > 0 && (
        <View style={styles.communitySection}>
          <Text style={styles.sectionTitle}>❤️  {he.community.section_title}</Text>
          <Text style={styles.sectionSubtitle}>{he.community.section_subtitle}</Text>
          <FlatList
            data={communityTasks}
            keyExtractor={(item) => item.id}
            renderItem={renderCommunityCard}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* Load more indicator */}
      {isLoadingMore && (
        <View style={styles.loadMore}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      )}
    </View>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.postButton} onPress={onPostTask}>
          <Text style={styles.postButtonText}>+ {he.tasks.post_task}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{he.home.nearby_tasks}</Text>
      </View>

      {/* Category filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryBar}
      >
        {CATEGORY_FILTERS.map(({ key, emoji, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.catPill, activeCategory === key && styles.catPillActive]}
            onPress={() => handleCategoryChange(key)}
          >
            <Text style={styles.catPillEmoji}>{emoji}</Text>
            <Text style={[styles.catPillText, activeCategory === key && styles.catPillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Task List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{he.common.loading}</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.task.id}
          renderItem={renderTaskCard}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? Colors.success : score >= 40 ? Colors.warning : Colors.error;
  return (
    <View style={[styles.scoreBadge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.scoreText, { color }]}>{score}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, paddingTop: 56,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  postButton: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, borderRadius: BorderRadius.pill,
  },
  postButtonText: { fontSize: 13, color: Colors.textInverse, fontWeight: '700' },
  categoryBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm, gap: Spacing.xs + 2 },
  catPill: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: BorderRadius.pill, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, flexShrink: 0,
  },
  catPillActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary, borderWidth: 2 },
  catPillEmoji: { fontSize: 12, lineHeight: 16 },
  catPillText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  catPillTextActive: { color: Colors.primary, fontWeight: '700' },
  sortRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingTop: Spacing.xs, paddingBottom: Spacing.sm },
  sortChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: BorderRadius.pill, backgroundColor: Colors.background,
  },
  sortChipActive: { backgroundColor: Colors.primary },
  sortChipText: { fontSize: 12, color: Colors.textSecondary },
  sortChipTextActive: { color: Colors.textInverse, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: 12 },
  taskCard: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md, ...Shadows.md,
    borderWidth: 1, borderColor: Colors.divider,
  },
  communityCard: { borderColor: Colors.communityBorder, borderWidth: 1.5 },
  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  cardTitle: { ...Typography.label, flex: 1, lineHeight: 22 },
  distanceBadge: {
    backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.sm,
    paddingVertical: 2, borderRadius: BorderRadius.sm, flexShrink: 0,
  },
  distanceText: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
  badgeRow: { flexDirection: 'row-reverse', gap: Spacing.xs, marginBottom: Spacing.sm, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.sm, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  badgeVehicle: { backgroundColor: '#FFF3E0', borderColor: '#FF9800' },
  badgeCategory: { backgroundColor: Colors.surface },
  badgeText: { ...Typography.caption, color: Colors.textSecondary },
  clientRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  clientInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: Spacing.xs },
  trustDot: { width: 8, height: 8, borderRadius: 4 },
  clientName: { ...Typography.caption, color: Colors.textSecondary },
  offersCount: { backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  offersCountText: { ...Typography.caption, color: Colors.textSecondary },
  cardBottomRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { ...Typography.h3, color: Colors.primary },
  scoreBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.pill, borderWidth: 1 },
  scoreText: { ...Typography.caption, fontWeight: '700' },
  communitySection: { marginTop: Spacing.lg },
  sectionTitle: { ...Typography.h3, marginBottom: Spacing.xs },
  sectionSubtitle: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.md },
  loadMore: { padding: Spacing.xl, alignItems: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { ...Typography.body, color: Colors.textSecondary },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.md },
  emptyCard: {
    alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, padding: Spacing.xl, width: '100%',
    borderWidth: 1, borderColor: Colors.divider,
  },
  emptyEmoji: { fontSize: 64, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h3, textAlign: 'center', marginBottom: Spacing.sm },
  emptySubtitle: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
  emptyCta: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.pill,
    ...Shadows.button,
  },
  emptyCtaText: { ...Typography.button, color: Colors.textInverse },
});
