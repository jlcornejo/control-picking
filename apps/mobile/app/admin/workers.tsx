import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet, Dimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { createWorkerSchema } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { useOrgSettings } from '../../src/hooks/useOrgSettings';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../src/components/form/FormControls';

type WorkerRow = {
  id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  role: 'admin' | 'supervisor' | 'crew_lead' | 'worker';
  status: string;
  qr_badge_url: string | null;
};

const QR_SIZE = Math.min(Dimensions.get('window').width * 0.6, 240);

// Roles creables desde el formulario. Se incluye 'crew_lead' (Encargado) para
// poder armar cuadrillas en el módulo de Administración (modo capataz).
const ROLE_OPTIONS = [
  { value: 'worker', label: 'Trabajador' },
  { value: 'crew_lead', label: 'Encargado' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Administrador' },
];

export default function AdminWorkersScreen() {
  const { roleLabel } = useOrgSettings();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [formWorker, setFormWorker] = useState<WorkerRow | 'new' | null>(null);
  const [badgeWorker, setBadgeWorker] = useState<WorkerRow | null>(null);

  const { data: workers, isLoading, refetch } = useQuery({
    queryKey: ['admin-workers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, national_id, phone, role, status, qr_badge_url')
        .order('full_name');
      if (error) throw error;
      return data as WorkerRow[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (w: WorkerRow) => {
      const newStatus = w.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('workers').update({ status: newStatus }).eq('id', w.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filtered = (workers || []).filter((w) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.full_name.toLowerCase().includes(q) ||
      (w.national_id || '').toLowerCase().includes(q) ||
      (w.phone || '').toLowerCase().includes(q)
    );
  });

  function confirmToggle(w: WorkerRow) {
    const activating = w.status !== 'active';
    Alert.alert(
      activating ? 'Activar trabajador' : 'Desactivar trabajador',
      `¿${activating ? 'Activar' : 'Desactivar'} a ${w.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(w) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nombre, RUT, teléfono…"
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
        renderItem={({ item }) => (
          <RowItem
            title={item.full_name}
            subtitle={`${roleLabel(item.role)}${item.national_id ? ` · ${item.national_id}` : ''}`}
            icon="person"
            iconColor={item.status === 'active' ? colors.primary : colors.textMuted}
            badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
            right={
              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => setBadgeWorker(item)}>
                  <Ionicons name="qr-code-outline" size={18} color={colors.blue} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => setFormWorker(item)}>
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
              icon="people-outline"
              title={search ? 'Sin resultados' : 'Sin trabajadores'}
              message={search ? 'Prueba con otro término de búsqueda.' : 'Crea el primer trabajador con el botón +.'}
              iconColor={colors.primary}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormWorker('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <WorkerFormModal
        target={formWorker}
        onClose={() => setFormWorker(null)}
        onSaved={() => {
          setFormWorker(null);
          queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
        }}
      />

      <BadgeModal worker={badgeWorker} roleLabel={badgeWorker ? roleLabel(badgeWorker.role) : ''} onClose={() => setBadgeWorker(null)} />
    </View>
  );
}

function WorkerFormModal({
  target, onClose, onSaved,
}: {
  target: WorkerRow | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as WorkerRow) : null;

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('worker');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Reinicia el formulario cada vez que cambia el target.
  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setFullName(initial?.full_name ?? '');
    setNationalId(initial?.national_id ?? '');
    setPhone(initial?.phone ?? '');
    setRole(initial?.role && ROLE_OPTIONS.some((r) => r.value === initial.role) ? initial.role : 'worker');
    setErrors({});
  }

  async function handleSubmit() {
    const raw = {
      full_name: fullName.trim(),
      national_id: nationalId.trim() || null,
      phone: phone.trim() || null,
      role,
    };
    const parsed = createWorkerSchema.safeParse(raw);
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
          .from('workers')
          .update({
            full_name: parsed.data.full_name,
            national_id: parsed.data.national_id ?? null,
            phone: parsed.data.phone ?? null,
            role: parsed.data.role,
          })
          .eq('id', initial.id);
        if (error) throw error;
      } else {
        // Al crear, se genera el badge QR (UUID opaco), igual que la web.
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase.from('workers').insert({
          full_name: parsed.data.full_name,
          national_id: parsed.data.national_id ?? null,
          phone: parsed.data.phone ?? null,
          role: parsed.data.role,
          qr_badge_url: Crypto.randomUUID(),
        });
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar el trabajador');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar trabajador' : 'Nuevo trabajador'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre completo" required error={errors.full_name}>
              <TextField value={fullName} onChangeText={setFullName} hasError={!!errors.full_name} placeholder="Juan Pérez" />
            </Field>
            <Field label="RUT" error={errors.national_id}>
              <TextField value={nationalId} onChangeText={setNationalId} hasError={!!errors.national_id} placeholder="12.345.678-9" />
            </Field>
            <Field label="Teléfono" error={errors.phone}>
              <TextField value={phone} onChangeText={setPhone} hasError={!!errors.phone} placeholder="+56 9 1234 5678" keyboardType="phone-pad" />
            </Field>
            <Field label="Rol" required error={errors.role}>
              <SelectField value={role} options={ROLE_OPTIONS} onChange={setRole} hasError={!!errors.role} />
            </Field>
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear trabajador'} loading={loading} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BadgeModal({ worker, roleLabel, onClose }: { worker: WorkerRow | null; roleLabel: string; onClose: () => void }) {
  return (
    <Modal visible={!!worker} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.badgeBackdrop}>
        <View style={s.badgeCard}>
          <View style={s.badgeHeaderRow}>
            <Text style={s.badgeBrand}>Fundo360</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {worker?.qr_badge_url ? (
            <View style={s.qrBox}>
              <QRCode value={worker.qr_badge_url} size={QR_SIZE} color={colors.primary} backgroundColor="#ffffff" ecl="H" />
            </View>
          ) : (
            <View style={[s.qrBox, { paddingVertical: spacing.xxxl }]}>
              <Text style={s.noBadge}>Este trabajador no tiene badge QR.</Text>
            </View>
          )}
          <Text style={s.badgeName}>{worker?.full_name}</Text>
          <Text style={s.badgeRole}>{roleLabel}</Text>
          {worker?.qr_badge_url ? <Text style={s.badgeId}>{worker.qr_badge_url}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: { padding: 6, borderRadius: radius.sm },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  sheetTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
  badgeBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  badgeCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center' },
  badgeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: spacing.lg },
  badgeBrand: { fontSize: 16, fontWeight: font.extrabold, color: colors.primary },
  qrBox: { backgroundColor: '#ffffff', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder },
  noBadge: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  badgeName: { fontSize: 18, fontWeight: font.bold, color: colors.text, marginTop: spacing.lg },
  badgeRole: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  badgeId: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
