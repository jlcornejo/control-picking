import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, font } from '../constants/theme';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  maxDate?: string; // YYYY-MM-DD
}

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const date = new Date(parts[0]!, parts[1]! - 1, parts[2]);
  return date.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function addDays(dateStr: string, offset: number): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DatePicker({ value, onChange, maxDate }: DatePickerProps) {
  const today = maxDate || localToday();
  const isToday = value === today;
  const canGoForward = value < today;

  return (
    <View style={s.container}>
      <TouchableOpacity
        onPress={() => onChange(addDays(value, -1))}
        style={s.arrowButton}
        activeOpacity={0.7}
        accessibilityLabel="Día anterior"
      >
        <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={s.dateDisplay}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
        <Text style={s.dateText}>{formatDisplayDate(value)}</Text>
        {isToday && (
          <View style={s.todayBadge}>
            <Text style={s.todayText}>Hoy</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => canGoForward && onChange(addDays(value, 1))}
        style={[s.arrowButton, !canGoForward && s.arrowDisabled]}
        activeOpacity={canGoForward ? 0.7 : 1}
        disabled={!canGoForward}
        accessibilityLabel="Día siguiente"
      >
        <Ionicons name="chevron-forward" size={18} color={canGoForward ? colors.textSecondary : colors.cardBorder} />
      </TouchableOpacity>

      {!isToday && (
        <TouchableOpacity onPress={() => onChange(today)} style={s.todayButton} activeOpacity={0.7}>
          <Text style={s.todayButtonText}>Hoy</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  arrowButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  dateDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dateText: {
    fontSize: 14,
    fontWeight: font.semibold,
    color: colors.text,
  },
  todayBadge: {
    marginLeft: spacing.sm,
    backgroundColor: '#d1fae5',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayText: {
    fontSize: 10,
    fontWeight: font.bold,
    color: '#065f46',
  },
  todayButton: {
    backgroundColor: `${colors.primary}18`,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: font.semibold,
    color: colors.primary,
  },
});
