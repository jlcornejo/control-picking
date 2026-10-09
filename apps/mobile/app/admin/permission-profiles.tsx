import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ALL_CAPABILITIES, CAPABILITY_LABELS, createPermissionProfileSchema, type Capability } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField, SubmitButton, RowItem } from '../../src/components/form/FormControls';

type ProfileRow = {
  id: string;
  name: string;
  capabilities: Capability[];
  status: string;
};

export default function AdminPermissionProfilesScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [formProfile, setFormProfile] = useState<ProfileRow | 'new' | null>(null);

  const { data: profiles, isLoading, refetch } = useQuery({
    queryKey: ['admin-permission-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_profiles')
        .select('id, name, capabilities, status')
        .order('name');
      if (error) throw error;
      return data as unknown as ProfileRow[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (p: ProfileRow) => {
      const newStatus = p.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('permission_profiles').update({ status: newStatus }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-permission-profiles'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function confirmToggle(p: ProfileRow) {
    const activating = p.status !== 'active';
    Alert.alert(
      activating ? 'Activar perfil' : 'Desactivar perfil',
      `¿${activating ? 'Activar' : 'Desactivar'} "${p.name}"? Al desactivarlo, los usuarios con este perfil recuperan las capacidades completas de su rol.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(p) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={profiles || []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <RowItem
            title={item.name}
            subtitle={`${item.capabilities?.length ?? 0} capacidad(es) habilitada(s)`}
            icon="shield-checkmark-outline"
            iconColor={item.status === 'active' ? colors.violet : colors.textMuted}
            badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
            right={
              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => setFormProfile(item)}>
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
              icon="shield-checkmark-outline"
              title="Sin perfiles de permisos"
              message="Crea un perfil con el botón + para restringir qué puede hacer un usuario dentro de su rol."
              iconColor={colors.violet}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormProfile('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <ProfileFormModal
        target={formProfile}
        onClose={() => setFormProfile(null)}
        onSaved={() => {
          setFormProfile(null);
          queryClient.invalidateQueries({ queryKey: ['admin-permission-profiles'] });
        }}
      />
    </View>
  );
}

function ProfileFormModal({
  target, onClose, onSaved,
}: {
  target: ProfileRow | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as ProfileRow) : null;

  const [name, setName] = useState('');
  const [caps, setCaps] = useState<Capability[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setCaps(initial?.capabilities ?? []);
    setErrors({});
  }

  function toggleCap(cap: Capability) {
    Haptics.selectionAsync();
    setCaps((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
  }

  async function handleSubmit() {
    const parsed = createPermissionProfileSchema.safeParse({ name: name.trim(), capabilities: caps });
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
        const { error } = await supabase
          .from('permission_profiles')
          .update({ name: parsed.data.name, capabilities: parsed.data.capabilities })
          .eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase
          .from('permission_profiles')
          .insert({ name: parsed.data.name, capabilities: parsed.data.capabilities });
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar el perfil');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar perfil' : 'Nuevo perfil'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre del perfil" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Secretaría, Admin sin pagos…" />
            </Field>

            <Text style={s.capsLabel}>Capacidades habilitadas</Text>
            {errors.capabilities ? <Text style={s.capsError}>{errors.capabilities}</Text> : null}
            <Text style={s.capsHint}>
              El perfil restringe al usuario a estas capacidades dentro de su rol. Las no marcadas quedan bloqueadas.
            </Text>
            {ALL_CAPABILITIES.map((cap) => {
              const on = caps.includes(cap);
              return (
                <TouchableOpacity key={cap} style={s.capRow} onPress={() => toggleCap(cap)} activeOpacity={0.7}>
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                  />
                  <Text style={[s.capText, on && s.capTextOn]}>{CAPABILITY_LABELS[cap]}</Text>
                </TouchableOpacity>
              );
            })}

            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear perfil'} loading={loading} onPress={handleSubmit} />
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
  capsLabel: { fontSize: 13, fontWeight: font.semibold, color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  capsError: { fontSize: 12, color: colors.red, marginBottom: spacing.xs },
  capsHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  capText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  capTextOn: { color: colors.text, fontWeight: font.medium },
});
