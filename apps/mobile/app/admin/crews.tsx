import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../src/lib/supabase';
import { useOrgSettings } from '../../src/hooks/useOrgSettings';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../src/components/form/FormControls';

type CrewRow = {
  id: string;
  name: string;
  crew_lead_id: string | null;
  supervisor_id: string | null;
  status: string;
  lead_name?: string;
  supervisor_name?: string;
  member_count?: number;
};

export default function AdminCrewsScreen() {
  const { crewModeEnabled, roleLabel, loading: settingsLoading } = useOrgSettings();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [formCrew, setFormCrew] = useState<CrewRow | 'new' | null>(null);
  const [membersCrew, setMembersCrew] = useState<CrewRow | null>(null);

  const crewTerm = roleLabel('crew_lead');

  const { data: crews, isLoading, refetch } = useQuery({
    queryKey: ['admin-crews'],
    enabled: crewModeEnabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crews')
        .select('id, name, crew_lead_id, supervisor_id, status')
        .order('name');
      if (error) throw error;
      const rows = data || [];

      // Resolver nombres de encargado y supervisor + contar miembros.
      const personIds = [
        ...new Set(rows.flatMap((c) => [c.crew_lead_id, c.supervisor_id]).filter(Boolean) as string[]),
      ];
      let nameMap: Record<string, string> = {};
      if (personIds.length > 0) {
        const { data: people } = await supabase.from('workers').select('id, full_name').in('id', personIds);
        nameMap = Object.fromEntries((people || []).map((p) => [p.id, p.full_name]));
      }
      const results: CrewRow[] = [];
      for (const c of rows) {
        const { count } = await supabase
          .from('workers')
          .select('id', { count: 'exact', head: true })
          .eq('crew_id', c.id);
        results.push({
          ...c,
          lead_name: c.crew_lead_id ? nameMap[c.crew_lead_id] : undefined,
          supervisor_name: c.supervisor_id ? nameMap[c.supervisor_id] : undefined,
          member_count: count ?? 0,
        });
      }
      return results;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (c: CrewRow) => {
      const newStatus = c.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('crews').update({ status: newStatus }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-crews'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function confirmToggle(c: CrewRow) {
    const activating = c.status !== 'active';
    Alert.alert(
      activating ? 'Activar cuadrilla' : 'Desactivar cuadrilla',
      `¿${activating ? 'Activar' : 'Desactivar'} "${c.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(c) },
      ],
    );
  }

  // Guard: si el modo capataz está desactivado, la sección no aplica.
  if (!settingsLoading && !crewModeEnabled) {
    return (
      <EmptyState
        icon="car-outline"
        title="Modo Capataz desactivado"
        message="Activa el Modo Capataz en Configuración para gestionar cuadrillas y encargados."
        iconColor={colors.amber}
      />
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={crews || []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <RowItem
            title={item.name}
            subtitle={`${crewTerm}: ${item.lead_name || '—'} · ${item.member_count} trab.`}
            icon="car"
            iconColor={item.status === 'active' ? colors.amber : colors.textMuted}
            badge={{ label: item.status === 'active' ? 'Activa' : 'Inactiva', color: item.status === 'active' ? colors.primary : colors.textMuted }}
            right={
              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => setMembersCrew(item)}>
                  <Ionicons name="people-outline" size={18} color={colors.blue} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => setFormCrew(item)}>
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
            <ListSkeleton count={4} />
          ) : (
            <EmptyState
              icon="car-outline"
              title="Sin cuadrillas"
              message="Crea la primera cuadrilla con el botón +."
              iconColor={colors.amber}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormCrew('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <CrewFormModal
        target={formCrew}
        crewTerm={crewTerm}
        onClose={() => setFormCrew(null)}
        onSaved={() => {
          setFormCrew(null);
          queryClient.invalidateQueries({ queryKey: ['admin-crews'] });
        }}
      />

      <CrewMembersModal
        crew={membersCrew}
        onClose={() => setMembersCrew(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['admin-crews'] })}
      />
    </View>
  );
}

function CrewFormModal({
  target, crewTerm, onClose, onSaved,
}: {
  target: CrewRow | 'new' | null;
  crewTerm: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as CrewRow) : null;

  const [name, setName] = useState('');
  const [leadId, setLeadId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setLeadId(initial?.crew_lead_id ?? '');
    setSupervisorId(initial?.supervisor_id ?? '');
    setErrors({});
  }

  // Encargados (crew_lead) y supervisores activos disponibles.
  const { data: leads } = useQuery({
    queryKey: ['crew-leads-options'],
    enabled: !!target,
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('id, full_name').eq('role', 'crew_lead').eq('status', 'active').order('full_name');
      return (data || []) as { id: string; full_name: string }[];
    },
  });
  const { data: supervisors } = useQuery({
    queryKey: ['crew-supervisors-options'],
    enabled: !!target,
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('id, full_name').eq('role', 'supervisor').eq('status', 'active').order('full_name');
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  const leadOptions = (leads || []).map((l) => ({ value: l.id, label: l.full_name }));
  const supervisorOptions = (supervisors || []).map((sup) => ({ value: sup.id, label: sup.full_name }));

  async function handleSubmit() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Nombre es requerido';
    if (!leadId) errs.crew_lead_id = `Seleccione un ${crewTerm.toLowerCase()}`;
    if (!supervisorId) errs.supervisor_id = 'Seleccione un supervisor';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const payload = { name: name.trim(), crew_lead_id: leadId, supervisor_id: supervisorId };
      if (isEdit && initial) {
        const { error } = await supabase.from('crews').update(payload).eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase.from('crews').insert(payload);
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar la cuadrilla');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar cuadrilla' : 'Nueva cuadrilla'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre de la cuadrilla" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Furgón Norte" />
            </Field>
            <Field label={crewTerm} required error={errors.crew_lead_id}>
              {leadOptions.length === 0 ? (
                <Text style={s.note}>No hay trabajadores con rol {crewTerm}. Créalos primero en Trabajadores.</Text>
              ) : (
                <SelectField value={leadId} options={leadOptions} onChange={setLeadId} hasError={!!errors.crew_lead_id} />
              )}
            </Field>
            <Field label="Supervisor a cargo" required error={errors.supervisor_id}>
              {supervisorOptions.length === 0 ? (
                <Text style={s.note}>No hay supervisores. Créalos primero en Trabajadores.</Text>
              ) : (
                <SelectField value={supervisorId} options={supervisorOptions} onChange={setSupervisorId} hasError={!!errors.supervisor_id} />
              )}
            </Field>
            <SubmitButton
              label={isEdit ? 'Guardar cambios' : 'Crear cuadrilla'}
              loading={loading}
              disabled={leadOptions.length === 0 || supervisorOptions.length === 0}
              onPress={handleSubmit}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CrewMembersModal({
  crew, onClose, onChanged,
}: {
  crew: CrewRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: members, refetch: refetchMembers } = useQuery({
    queryKey: ['crew-members', crew?.id],
    enabled: !!crew?.id,
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('id, full_name').eq('crew_id', crew!.id).order('full_name');
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  // Disponibles: rol worker, activos, sin cuadrilla.
  const { data: available, refetch: refetchAvailable } = useQuery({
    queryKey: ['crew-available', crew?.id, members?.length],
    enabled: !!crew?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('role', 'worker')
        .eq('status', 'active')
        .is('crew_id', null)
        .order('full_name');
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  const addMember = useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await supabase.from('workers').update({ crew_id: crew!.id }).eq('id', workerId);
      if (error) throw error;
    },
    onSuccess: async () => { Haptics.selectionAsync(); await Promise.all([refetchMembers(), refetchAvailable()]); onChanged(); },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo asignar'),
  });
  const removeMember = useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await supabase.from('workers').update({ crew_id: null }).eq('id', workerId).eq('crew_id', crew!.id);
      if (error) throw error;
    },
    onSuccess: async () => { Haptics.selectionAsync(); await Promise.all([refetchMembers(), refetchAvailable()]); onChanged(); },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo quitar'),
  });

  return (
    <Modal visible={!!crew} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Trabajadores — {crew?.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={s.sectionLabel}>MIEMBROS ({(members || []).length})</Text>
            {(members || []).length === 0 ? (
              <Text style={s.note}>Sin trabajadores asignados.</Text>
            ) : (
              (members || []).map((m) => (
                <View key={m.id} style={s.memberRow}>
                  <Text style={s.memberName}>{m.full_name}</Text>
                  <TouchableOpacity onPress={() => removeMember.mutate(m.id)}>
                    <Ionicons name="person-remove-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>AGREGAR</Text>
            {(available || []).length === 0 ? (
              <Text style={s.note}>No hay trabajadores disponibles (rol Trabajador, activos y sin cuadrilla).</Text>
            ) : (
              (available || []).map((w) => (
                <TouchableOpacity key={w.id} style={s.addRow} onPress={() => addMember.mutate(w.id)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={s.addName}>{w.full_name}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
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
  sheetTitle: { fontSize: 16, fontWeight: font.bold, color: colors.text, flex: 1 },
  note: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  sectionLabel: { fontSize: 11, fontWeight: font.semibold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  memberName: { fontSize: 14, color: colors.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  addName: { fontSize: 14, color: colors.text },
});
