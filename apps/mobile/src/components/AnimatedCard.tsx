import { useEffect, useRef } from 'react';
import { Animated, Pressable, ViewStyle } from 'react-native';

interface AnimatedCardProps {
  children: React.ReactNode;
  index?: number;
  style?: ViewStyle;
  onPress?: () => void;
  disabled?: boolean;
}

/**
 * Wraps a card with:
 * - Stagger fade-in on mount (based on index)
 * - Scale press effect (0.97) on touch
 */
export function AnimatedCard({ children, index = 0, style, onPress, disabled }: AnimatedCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index * 60, 400);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.97,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }

  const animatedStyle = {
    opacity,
    transform: [{ translateY }, { scale }],
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
      >
        <Animated.View style={[animatedStyle, style]}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
