import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font } from '../constants/theme';

const { width } = Dimensions.get('window');

interface SuccessOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onFinish: () => void;
  duration?: number;
}

export function SuccessOverlay({ visible, title, subtitle, onFinish, duration = 1800 }: SuccessOverlayProps) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Reset
    scale.setValue(0);
    opacity.setValue(0);
    checkScale.setValue(0);
    textOpacity.setValue(0);

    // Animate in
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
      ]),
      Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration - 800),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      onFinish();
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.overlay, { opacity }]}>
      <Animated.View style={[s.circle, { transform: [{ scale }] }]}>
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Ionicons name="checkmark-circle" size={64} color="#fff" />
        </Animated.View>
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 150, 105, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: font.bold,
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: width * 0.7,
  },
});
