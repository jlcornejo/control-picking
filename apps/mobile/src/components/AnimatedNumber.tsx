import { useEffect, useRef, useState } from 'react';
import { Text, Animated, TextStyle } from 'react-native';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  formatFn?: (n: number) => string;
}

/**
 * Animates a number from 0 to target value with easing.
 * Uses manual frame updates (Hermes-compatible, no toLocaleString with locales).
 */
export function AnimatedNumber({
  value,
  duration = 1000,
  prefix = '',
  suffix = '',
  style,
  formatFn,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(prefix + '0' + suffix);
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animatedValue.setValue(0);

    const listener = animatedValue.addListener(({ value: v }) => {
      const rounded = Math.round(v);
      const formatted = formatFn ? formatFn(rounded) : formatWithDots(rounded);
      setDisplay(`${prefix}${formatted}${suffix}`);
    });

    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false, // must be false for value listener
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [value]);

  return <Text style={style}>{display}</Text>;
}

// Manual thousand separator (Hermes doesn't support toLocaleString with locales)
function formatWithDots(n: number): string {
  const str = String(Math.abs(n));
  let result = '';
  for (let i = str.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) result = '.' + result;
    result = str[i] + result;
  }
  return n < 0 ? '-' + result : result;
}
