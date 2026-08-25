import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, radius, font } from '../constants/theme';
import * as Haptics from 'expo-haptics';

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const visibleRoutes = state.routes.filter((route) => {
    const descriptor = descriptors[route.key];
    if (!descriptor) return false;
    return (descriptor.options as any).href !== null;
  });

  const centerIndex = Math.floor(visibleRoutes.length / 2);

  return (
    <View style={s.wrapper}>
      <BlurView intensity={80} tint="light" style={s.blurContainer}>
        <View style={s.innerContainer}>
          {visibleRoutes.map((route, index) => {
            const descriptor = descriptors[route.key];
            if (!descriptor) return null;
            const { options } = descriptor;
            const realIndex = state.routes.indexOf(route);
            const isFocused = state.index === realIndex;
            const isCenter = index === centerIndex && visibleRoutes.length >= 4;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate(route.name);
              }
            };

            const label = typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title !== undefined ? options.title : route.name;

            const icon = options.tabBarIcon?.({
              focused: isFocused,
              color: isFocused ? colors.textWhite : colors.textMuted,
              size: 22,
            });

            // Center button (elevated)
            if (isCenter) {
              return (
                <TouchableOpacity key={route.key} onPress={onPress} activeOpacity={0.8} style={s.centerBtn}>
                  <View style={[s.centerCircle, isFocused && s.centerCircleActive]}>
                    {icon}
                  </View>
                  <Text style={[s.centerLabel, isFocused && s.centerLabelActive]}>{label}</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity key={route.key} onPress={onPress} activeOpacity={0.7} style={s.tab}>
                <View style={[s.iconWrap, isFocused && s.iconWrapActive]}>
                  {icon}
                </View>
                <Text style={[s.label, isFocused && s.labelActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    right: 16,
  },
  blurContainer: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  innerContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  iconWrapActive: {
    backgroundColor: colors.primaryBg,
  },
  label: {
    fontSize: 9,
    fontWeight: font.medium,
    color: colors.textMuted,
    marginTop: 2,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: font.semibold,
  },
  centerBtn: {
    alignItems: 'center',
    marginTop: -28,
  },
  centerCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  centerCircleActive: {
    backgroundColor: colors.primaryDark,
    shadowOpacity: 0.5,
  },
  centerLabel: {
    fontSize: 9,
    fontWeight: font.semibold,
    color: colors.primary,
    marginTop: 4,
  },
  centerLabelActive: {
    color: colors.primaryDark,
  },
});
