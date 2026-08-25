import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

// Base shimmer skeleton block
function SkeletonBlock({ width, height, borderRadius = 8, style }: { width: number | string; height: number; borderRadius?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.cardBorder, opacity },
        style,
      ]}
    />
  );
}

// Skeleton for a single record card in production list
export function CardSkeleton() {
  return (
    <View style={s.card}>
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBlock width={100} height={12} />
        <SkeletonBlock width={160} height={14} />
        <SkeletonBlock width={60} height={10} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <SkeletonBlock width={40} height={24} borderRadius={6} />
        <SkeletonBlock width={70} height={12} />
      </View>
    </View>
  );
}

// Skeleton for KPI mini cards (2x2 grid in metrics)
export function KpiSkeleton() {
  return (
    <View style={s.kpiCard}>
      <SkeletonBlock width={36} height={36} borderRadius={12} />
      <SkeletonBlock width={80} height={20} borderRadius={6} style={{ marginTop: 10 }} />
      <SkeletonBlock width={60} height={10} style={{ marginTop: 6 }} />
    </View>
  );
}

// Skeleton for list of cards (production/payments)
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

// Skeleton for the metrics KPI grid
export function MetricsSkeleton() {
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <KpiSkeleton />
        <KpiSkeleton />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <KpiSkeleton />
        <KpiSkeleton />
      </View>
      {/* Ranking skeleton */}
      <SkeletonBlock width="100%" height={16} style={{ marginTop: spacing.lg }} />
      <View style={s.rankingCard}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={s.rankRow}>
            <SkeletonBlock width={30} height={30} borderRadius={15} />
            <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
              <SkeletonBlock width={120} height={14} />
              <SkeletonBlock width="80%" height={5} borderRadius={3} />
            </View>
            <SkeletonBlock width={30} height={16} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

// Skeleton for payments list
export function PaymentsSkeleton() {
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Summary card skeleton */}
      <View style={s.summaryCard}>
        <SkeletonBlock width={100} height={12} />
        <SkeletonBlock width={140} height={28} borderRadius={8} style={{ marginTop: 8 }} />
        <SkeletonBlock width={80} height={10} style={{ marginTop: 6 }} />
      </View>
      {/* List items */}
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={s.paymentCard}>
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock width={140} height={14} />
            <SkeletonBlock width={100} height={10} />
          </View>
          <SkeletonBlock width={80} height={20} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

// Skeleton for production header
export function ProductionHeaderSkeleton() {
  return (
    <View style={s.prodHeader}>
      <View style={{ alignItems: 'center' }}>
        <SkeletonBlock width={80} height={36} borderRadius={8} />
        <SkeletonBlock width={50} height={10} style={{ marginTop: 6 }} />
      </View>
      <View style={{ width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' }} />
      <View style={{ alignItems: 'center' }}>
        <SkeletonBlock width={100} height={22} borderRadius={6} />
        <SkeletonBlock width={60} height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rankingCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  prodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
});
