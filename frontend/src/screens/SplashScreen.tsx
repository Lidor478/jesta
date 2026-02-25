/**
 * @file SplashScreen.tsx
 * @description Animated Hebrew onboarding splash with 3 feature slides.
 * Shown to first-time users before phone auth.
 *
 * @hebrew מסך פתיחה ראשוני עם הכרת התכונות של האפליקציה
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  StatusBar,
  SafeAreaView,
  ViewToken,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/rtl';
import he from '../i18n/he.json';

const MAX_CONTENT_WIDTH = 480;

// ─── Slide Data ───────────────────────────────────────────────────────────────

interface Slide {
  id: string;
  emoji: string;
  title: string;
  body: string;
  bgColor: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    emoji: '🙋',
    title: he.onboarding.slide1_title,
    body: he.onboarding.slide1_body,
    bgColor: '#EFF6FF',
  },
  {
    id: '2',
    emoji: '💼',
    title: he.onboarding.slide2_title,
    body: he.onboarding.slide2_body,
    bgColor: '#D1FAE5',
  },
  {
    id: '3',
    emoji: '❤️',
    title: he.onboarding.slide3_title,
    body: he.onboarding.slide3_body,
    bgColor: '#FEF3C7',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const { width: windowWidth } = useWindowDimensions();

  const slideWidth = Platform.OS === 'web'
    ? Math.min(windowWidth, MAX_CONTENT_WIDTH)
    : windowWidth;

  const isLastSlide = activeIndex === SLIDES.length - 1;

  const handleViewableChange = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index !== undefined) {
        setActiveIndex(viewableItems[0].index!);
      }
    }
  ).current;

  const handleNext = () => {
    if (isLastSlide) {
      onComplete();
    } else {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={[styles.content, { maxWidth: MAX_CONTENT_WIDTH, width: '100%' }]}>
        {/* Skip button (top-left in RTL = top-right visually) */}
        <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
          <Text style={styles.skipText}>{he.onboarding.skip}</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>{he.app.name}</Text>
          <Text style={styles.taglineText}>{he.app.tagline}</Text>
        </View>

        {/* Slides */}
        <Animated.FlatList
          ref={flatListRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          inverted={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          onViewableItemsChanged={handleViewableChange}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          style={{ width: slideWidth }}
          renderItem={({ item }: { item: Slide }) => (
            <SlideCard slide={item} slideWidth={slideWidth} />
          )}
        />

        {/* Dot indicators */}
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, i) => {
            const opacity = scrollX.interpolate({
              inputRange: [(i - 1) * slideWidth, i * slideWidth, (i + 1) * slideWidth],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            const width = scrollX.interpolate({
              inputRange: [(i - 1) * slideWidth, i * slideWidth, (i + 1) * slideWidth],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { opacity, width }]}
              />
            );
          })}
        </View>

        {/* CTA Button */}
        <TouchableOpacity style={styles.ctaButton} onPress={handleNext}>
          <Text style={styles.ctaText}>
            {isLastSlide ? he.onboarding.get_started : he.common.next}
          </Text>
        </TouchableOpacity>

        {/* Terms note */}
        <Text style={styles.termsText}>
          {he.auth.agree_terms}{' '}
          <Text style={styles.termsLink}>{he.auth.terms}</Text>
          {' '}{he.auth.and}{' '}
          <Text style={styles.termsLink}>{he.auth.privacy}</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Slide Card ───────────────────────────────────────────────────────────────

function SlideCard({ slide, slideWidth }: { slide: Slide; slideWidth: number }) {
  return (
    <View style={[styles.slide, { width: slideWidth }]}>
      <View style={styles.slideCard}>
        <View style={styles.emojiContainer}>
          <Text style={styles.emoji}>{slide.emoji}</Text>
        </View>
        <Text style={styles.slideTitle}>{slide.title}</Text>
        <Text style={styles.slideBody}>{slide.body}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    alignSelf: 'center',
  },
  skipButton: {
    alignSelf: 'flex-start',  // In RTL, this aligns to the right (start = right)
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  skipText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  logoText: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 1,
  },
  taglineText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  slideCard: {
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    width: '100%',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24 },
      android: { elevation: 6 },
    }),
  },
  emojiContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emoji: {
    fontSize: 64,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  slideBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.pill,
    marginBottom: Spacing.md,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  ctaText: {
    ...Typography.button,
    color: Colors.textInverse,
    fontWeight: '700',
  },
  termsText: {
    fontSize: 11,
    color: Colors.textDisabled,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  termsLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
