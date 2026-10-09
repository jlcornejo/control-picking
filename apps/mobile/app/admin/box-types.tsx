import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { createBoxTypeSchema, ToleranceUnit } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../src/components/form/FormControls';

type BoxTypeRow = {
  id: string;
  name: string;
  tare_weight_kg: number;
  target_net_weight_kg: number;
  tolerance_over: number;
  tolerance_under: number;
  tolerance_unit: string;
  status: string;
};

const UNIT_OPTIONS = [
  { value: 'percent', label: '% del objetivo' },
  { value: 'kg', label: 'Kilos (kg)' },
];

/** Descripción legible de la banda de tolerancia. */
function toleranceLabel(b: BoxTypeRow): string {
  const u = b.tolerance_unit === 'percent' ? '%' : 'kg';
  return `Objetivo ${b.target_net_weight_kg} kg · tara ${b.tare_weight_kg} kg · ±${b.tolerance_under}/${b.tolerance_over} ${u}`;
}

export default function AdminBoxTypesScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [formBox, setFormBox] = useState<BoxTypeRow | 'new' | null>(null);

  const { data: boxTypes, isLoading, refetch } = useQuery({
    queryKey: ['admin-box-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('box_types')
        .select('id, name, tare_weight_kg, target_net_weight_kg, tolerance_over, tolerance_under, tolerance_unit, status')
        .order('name');
      if (error) throw error;
      return data as unknown as BoxTypeRow[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (b: BoxTypeRow) => {
      const newStatus = b.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('box_types').update({ status: newStatus }).eq('id', b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-box-types'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function confirmToggle(b: BoxTypeRow) {
    const activating = b.status !== 'active';
    Alert.alert(
      activating ? 'Activar tipo de caja' : 'Desactivar tipo de caja',
      `¿${activating ? 'Activar' : 'Desactivar'} "${b.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(b) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={boxTypes || []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <RowItem
            title={item.name}
            subtitle={toleranceLabel(item)}
            icon="cube-outline"
            iconColor={item.status === 'active' ? colors.violet : colors.textMuted}
            badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
            right={
              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => setFormBox(item)}>
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => confirmToggle(item)}>
                  <Ionicons name={item.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={item.status === 'active' ? colors.red : colors.primary} />
                </TouchableOpacity>
              </View>
            }
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton count={5} />
          ) : (
            <EmptyState
              icon="cube-outline"
              title="Sin tipos de caja"
              message="Crea el primer tipo de caja con el botón +. Define su tara, peso objetivo y tolerancia."
              iconColor={colors.violet}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormBox('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <BoxTypeFormModal
        target={formBox}
        onClose={() => setFormBox(null)}
        onSaved={() => {
          setFormBox(null);
          queryClient.invalidateQueries({ queryKey: ['admin-box-types'] });
          queryClient.invalidateQueries({ queryKey: ['box-types'] });
        }}
      />
    </View>
  );
}

function BoxTypeFormModal({
  target, onClose, onSaved,
}: {
  target: BoxTypeRow | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as BoxTypeRow) : null;

  const [name, setName] = useState('');
  const [tare, setTare] = useState('');
  const [target_net, setTargetNet] = useState('');
  const [over, setOver] = useState('');
  const [under, setUnder] = useState('');
  const [unit, setUnit] = useState<string>('percent');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setTare(initial ? String(initial.tare_weight_kg) : '');
    setTargetNet(initial ? String(initial.target_net_weight_kg) : '');
    setOver(initial ? String(initial.tolerance_over) : '0');
    setUnder(initial ? String(initial.tolerance_under) : '0');
    setUnit(initial?.tolerance_unit ?? 'percent');
    setErrors({});
  }

  async function handleSubmit() {
    const raw = {
      name: name.trim(),
      tare_weight_kg: parseFloat(tare),
      target_net_weight_kg: parseFloat(target_net),
      tolerance_over: over.trim() ? parseFloat(over) : 0,
      tolerance_under: under.trim() ? parseFloat(under) : 0,
      tolerance_unit: unit as ToleranceUnit,
    };
    const parsed = createBoxTypeSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') errs[path] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (isEdit && initial) {
        const { error } = await supabase.from('box_types').update(parsed.data).eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase.from('box_types').insert(parsed.data);
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar el tipo de caja');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar tipo de caja' : 'Nuevo tipo de caja'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Bandeja 10 kg" />
            </Field>
            <Field label="Tara / destare (kg)" required error={errors.tare_weight_kg}>
              <TextField value={tare} onChangeText={setTare} hasError={!!errors.tare_weight_kg} placeholder="0.200" keyboardType="decimal-pad" />
            </Field>
            <Field label="Peso neto objetivo (kg)" required error={errors.target_net_weight_kg}>
              <TextField value={target_net} onChangeText={setTargetNet} hasError={!!errors.target_net_weight_kg} placeholder="10" keyboardType="decimal-pad" />
            </Field>
            <Field label="Unidad de tolerancia" required error={errors.tolerance_unit}>
              <SelectField value={unit} options={UNIT_OPTIONS} onChange={setUnit} hasError={!!errors.tolerance_unit} />
            </Field>
            <Field label="Tolerancia superior" error={errors.tolerance_over}>
              <TextField value={over} onChangeText={setOver} hasError={!!errors.tolerance_over} placeholder={unit === 'percent' ? 'Ej: 3 (%)' : 'Ej: 0.3 (kg)'} keyboardType="decimal-pad" />
            </Field>
            <Field label="Tolerancia inferior" error={errors.tolerance_under}>
              <TextField value={under} onChangeText={setUnder} hasError={!!errors.tolerance_under} placeholder={unit === 'percent' ? 'Ej: 3 (%)' : 'Ej: 0.3 (kg)'} keyboardType="decimal-pad" />
            </Field>
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear tipo de caja'} loading={loading} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: { padding: 6, borderRadius: radius.sm },
  fab: {
    position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  sheetTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
});
