import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, font } from '../constants/theme';
import { AppText } from './AppText';

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  iconColor?: string;
}

export function EmptyState({ icon, title, message, actionLabel, onAction, iconColor }: EmptyStateProps) {
  return (
    <View style={s.container}>
      <View style={[s.iconCircle, iconColor ? { backgroundColor: `${iconColor}12` } : undefined]}>
        <Ionicons name={icon as any} size={36} color={iconColor || colors.textMuted} />
      </View>
      <AppText style={s.title}>{title}</AppText>
      <AppText style={s.message}>{message}</AppText>
      {actionLabel && onAction && (
        <TouchableOpacity style={s.actionBtn} onPress={onAction} activeOpacity={0.8}>
          <AppText style={s.actionText}>{actionLabel}</AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xxxl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: font.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  actionText: {
    fontSize: 13,
    fontWeight: font.semibold,
    color: colors.textWhite,
  },
});
