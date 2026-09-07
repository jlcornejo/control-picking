import { ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, font } from '../../constants/theme';

/**
 * Controles de formulario reutilizables para las pantallas de administración
 * del móvil. Siguen el tema de la app (constants/theme) y muestran errores de
 * validación (mismos schemas Zod de @fundo360/shared que usa la web).
 */

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

export function Field({ label, required, error, children }: FieldProps) {
  return (
    <View style={s.field}>
      <Text style={s.label}>
        {label}
        {required ? <Text style={s.req}> *</Text> : null}
      </Text>
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

interface TextFieldProps extends TextInputProps {
  hasError?: boolean;
}

export function TextField({ hasError, style, ...props }: TextFieldProps) {
  return (
    <TextInput
      style={[s.input, hasError && s.inputError, style]}
      placeholderTextColor={colors.textMuted}
      {...props}
    />
  );
}

interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  hasError?: boolean;
}

/** Selector simple tipo "chips" (evita dependencias de picker nativo). */
export function SelectField({ value, options, onChange, hasError }: SelectFieldProps) {
  return (
    <View style={[s.selectRow, hasError && s.selectRowError]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[s.chip, active && s.chipActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface SubmitButtonProps {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function SubmitButton({ label, loading, disabled, onPress }: SubmitButtonProps) {
  return (
    <TouchableOpacity
      style={[s.submit, (loading || disabled) && s.submitDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
    >
      <Text style={s.submitText}>{loading ? 'Guardando…' : label}</Text>
    </TouchableOpacity>
  );
}

interface RowItemProps {
  title: string;
  subtitle?: string;
  badge?: { label: string; color: string };
  right?: ReactNode;
  onPress?: () => void;
  icon?: string;
  iconColor?: string;
}

/** Fila estándar de listado (trabajadores, campos, productos, etc.). */
export function RowItem({ title, subtitle, badge, right, onPress, icon, iconColor }: RowItemProps) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={s.row} onPress={onPress} activeOpacity={0.7}>
      {icon ? (
        <View style={[s.rowIcon, iconColor ? { backgroundColor: `${iconColor}15` } : undefined]}>
          <Ionicons name={icon as any} size={18} color={iconColor || colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={[s.rowBadge, { backgroundColor: `${badge.color}20` }]}>
          <Text style={[s.rowBadgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      ) : null}
      {right}
    </Wrapper>
  );
}

const s = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: font.semibold, color: colors.text, marginBottom: spacing.sm },
  req: { color: colors.red },
  error: { fontSize: 12, color: colors.red, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  inputError: { borderColor: colors.red, backgroundColor: colors.redBg },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selectRowError: {},
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: font.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: font.semibold },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: font.semibold, color: colors.textWhite },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  rowSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  rowBadgeText: { fontSize: 11, fontWeight: font.semibold },
});
