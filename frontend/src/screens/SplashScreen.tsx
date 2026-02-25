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
  Dimensions,
  FlatList,
  TouchableOpacity,
  Animated,
  StatusBar,
  SafeAreaView,
  ViewToken,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/rtl';
import he from '../i18n/he.json';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
    bgColor: '#E8F0FE',
  },
  {
    id: '2',
    emoji: '💼',
    title: he.onboarding.slide2_title,
    body: he.onboarding.slide2_body,
    bgColor: '#E8F5E9',
  },
  {
    id: '3',
    emoji: '❤️',
    title: he.onboarding.slide3_title,
    body: he.onboarding.slide3_body,
    bgColor: '#FFF8E1',
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
        // RTL: flip the list so slides go right-to-left
        inverted={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={handleViewableChange}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }: { item: Slide }) => (
          <SlideCard slide={item} />
        )}
      />

      {/* Dot indicators */}
      <View style={styles.dotsContainer}>
        {SLIDES.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH],
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          const width = scrollX.interpolate({
            inputRange: [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH],
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
    </SafeAreaView>
  );
}

// ─── Slide Card ───────────────────────────────────────────────────────────────

function SlideCard({ slide }: { slide: Slide }) {
  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={[styles.emojiContainer, { backgroundColor: slide.bgColor }]}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
      </View>
      <Text style={styles.slideTitle}>{slide.title}</Text>
      <Text style={styles.slideBody}>{slide.body}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  skipButton: {
    alignSelf: 'flex-start',  // In RTL, this aligns to the right (start = right)
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  skipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
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
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  emojiContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  emoji: {
    fontSize: 56,
  },
  slideTitle: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  slideBody: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textSecondary,
    lineHeight: 26,
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
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.pill,
    marginBottom: Spacing.md,
    minWidth: 200,
    alignItems: 'center',
  },
  ctaText: {
    ...Typography.button,
    color: Colors.textInverse,
  },
  termsText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  termsLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
