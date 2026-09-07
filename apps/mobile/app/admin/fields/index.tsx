import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { createFieldSchema } from '@fundo360/shared';
import { supabase } from '../../../src/lib/supabase';
import { useOrgSettings } from '../../../src/hooks/useOrgSettings';
import { colors, radius, spacing, font } from '../../../src/constants/theme';
import { EmptyState } from '../../../src/components/EmptyState';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../../src/components/form/FormControls';

type FieldRow = {
  id: string;
  name: string;
  location: string | null;
  total_area: number;
  crew_mode_enabled: boolean | null;
  status: string;
  blocks?: { count: number }[];
};

// Override de Modo Capataz por campo: '' = heredar org, 'on' = true, 'off' = false.
const CREW_MODE_OPTIONS = [
  { value: '', label: 'Heredar' },
  { value: 'on', label: 'Activado' },
  { value: 'off', label: 'Desactivado' },
];
function crewModeToValue(v: boolean | null | undefined): string {
  return v === true ? 'on' : v === false ? 'off' : '';
}
function crewModeFromValue(s: string): boolean | null {
  return s === 'on' ? true : s === 'off' ? false : null;
}

export default function AdminFieldsScreen() {
  const { crewModeEnabled } = useOrgSettings();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [formField, setFormField] = useState<FieldRow | 'new' | null>(null);

  const { data: fields, isLoading, refetch } = useQuery({
    queryKey: ['admin-fields'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fields')
        .select('id, name, location, total_area, crew_mode_enabled, status, blocks(count)')
        .order('name');
      if (error) throw error;
      return data as FieldRow[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (f: FieldRow) => {
      const newStatus = f.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('fields').update({ status: newStatus }).eq('id', f.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-fields'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filtered = (fields || []).filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return f.name.toLowerCase().includes(q) || (f.location || '').toLowerCase().includes(q);
  });

  function confirmToggle(f: FieldRow) {
    const activating = f.status !== 'active';
    Alert.alert(
      activating ? 'Activar campo' : 'Desactivar campo',
      `¿${activating ? 'Activar' : 'Desactivar'} el campo "${f.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(f) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nombre o ubicación…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const count = item.blocks?.[0]?.count ?? 0;
          return (
            <RowItem
              title={item.name}
              subtitle={`${item.location ? item.location + ' · ' : ''}${item.total_area} ha · ${count} paño${count === 1 ? '' : 's'}`}
              icon="map"
              iconColor={item.status === 'active' ? colors.blue : colors.textMuted}
              badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
              onPress={() => router.push(`/admin/fields/${item.id}` as any)}
              right={
                <View style={s.actions}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => setFormField(item)}>
                    <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => confirmToggle(item)}>
                    <Ionicons name={item.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={item.status === 'active' ? colors.red : colors.primary} />
                  </TouchableOpacity>
                </View>
              }
            />
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton count={5} />
          ) : (
            <EmptyState
              icon="map-outline"
              title={search ? 'Sin resultados' : 'Sin campos'}
              message={search ? 'Prueba con otro término de búsqueda.' : 'Crea el primer campo con el botón +.'}
              iconColor={colors.blue}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormField('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <FieldFormModal
        target={formField}
        crewModeEnabled={crewModeEnabled}
        onClose={() => setFormField(null)}
        onSaved={() => {
          setFormField(null);
          queryClient.invalidateQueries({ queryKey: ['admin-fields'] });
        }}
      />
    </View>
  );
}

function FieldFormModal({
  target, crewModeEnabled, onClose, onSaved,
}: {
  target: FieldRow | 'new' | null;
  crewModeEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as FieldRow) : null;

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [totalArea, setTotalArea] = useState('');
  const [crewMode, setCrewMode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setLocation(initial?.location ?? '');
    setTotalArea(initial?.total_area != null ? String(initial.total_area) : '');
    setCrewMode(crewModeToValue(initial?.crew_mode_enabled));
    setErrors({});
  }

  async function handleSubmit() {
    const areaNum = parseFloat(totalArea);
    const raw = {
      name: name.trim(),
      location: location.trim() || null,
      total_area: isNaN(areaNum) ? undefined : areaNum,
    };
    const parsed = createFieldSchema.safeParse(raw);
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
      const payload: Record<string, unknown> = {
        name: parsed.data.name,
        location: parsed.data.location ?? null,
        total_area: parsed.data.total_area,
      };
      // El override de modo capataz por campo solo aplica si la org lo tiene activo.
      if (crewModeEnabled) payload.crew_mode_enabled = crewModeFromValue(crewMode);

      if (isEdit && initial) {
        const { error } = await supabase.from('fields').update(payload).eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase.from('fields').insert(payload);
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar el campo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar campo' : 'Nuevo campo'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Campo Norte" />
            </Field>
            <Field label="Ubicación" error={errors.location}>
              <TextField value={location} onChangeText={setLocation} hasError={!!errors.location} placeholder="Comuna / sector" />
            </Field>
            <Field label="Superficie (ha)" required error={errors.total_area}>
              <TextField value={totalArea} onChangeText={setTotalArea} hasError={!!errors.total_area} placeholder="12.5" keyboardType="decimal-pad" />
            </Field>
            {crewModeEnabled && (
              <Field label="Modo Capataz en este campo">
                <SelectField value={crewMode} options={CREW_MODE_OPTIONS} onChange={setCrewMode} />
              </Field>
            )}
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear campo'} loading={loading} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, marginHorizontal: spacing.lg, marginTop: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
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
