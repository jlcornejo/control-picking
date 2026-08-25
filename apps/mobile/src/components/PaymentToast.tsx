import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, font } from '../constants/theme';

interface PaymentToastProps {
  visible: boolean;
  count: number;
  onPress?: () => void;
  onDismiss?: () => void;
}

export function PaymentToast({ visible, count, onPress, onDismiss }: PaymentToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && count > 0) {
      // Slide in
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        dismiss();
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      dismiss();
    }
  }, [visible, count]);

  function dismiss() {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      onDismiss?.();
    });
  }

  if (!visible || count === 0) return null;

  return (
    <Animated.View style={[s.container, { transform: [{ translateY }], opacity }]}>
      <TouchableOpacity style={s.inner} onPress={onPress} activeOpacity={0.9}>
        <View style={s.iconCircle}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
        </View>
        <View style={s.textWrap}>
          <Text style={s.title}>
            {count === 1 ? '¡Recibiste un pago!' : `¡Recibiste ${count} pagos!`}
          </Text>
          <Text style={s.subtitle}>Toca para ver el detalle</Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: font.semibold,
    color: '#fff',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
});
