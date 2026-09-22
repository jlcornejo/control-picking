import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Alert, Modal,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { localDate } from '../utils/date';
import { colors, radius, spacing, font } from '../constants/theme';

/**
 * "Mi equipo de hoy": el responsable (Encargado o Supervisor) arma manualmente
 * su equipo de la jornada. El roster parte vacío cada día (aprobación por
 * jornada) y se puede quitar a todos o ajustar puntualmente.
 *
 * - leadId: el responsable autenticado (worker.id). Va como lead_id y added_by.
 * - crewId: cuadrilla a asociar cuando el responsable es un Encargado; null
 *   cuando es un Supervisor directo (sin cuadrilla).
 * - baseCrewId: cuadrilla base para pre-listar "su gente habitual" al agregar.
 *
 * La RLS del servidor valida que solo se agregue/quite en la jornada actual y
 * que lead_id/added_by = el usuario. Aquí solo se envían los datos.
 */
export function DayRosterManager({
  leadId,
  crewId,
  baseCrewId,
}: {
  leadId: string;
  crewId: string | null;
  baseCrewId: string | null;
}) {
  const queryClient = useQueryClient();
  const workDay = localDate(0);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  // Roster de HOY del responsable: trabajadores + su producción del día.
  const rosterQuery = useQuery({
    queryKey: ['day-roster', leadId, workDay],
    enabled: !!leadId,
    queryFn: async () => {
      const { data: roster, error } = await supabase
        .from('day_roster')
        .select('id, worker_id')
        .eq('lead_id', leadId)
        .eq('work_day', workDay);
      if (error) throw error;
      const ids = (roster || []).map((r) => r.worker_id);
      if (ids.length === 0) return [] as RosterMember[];

      const [{ data: ws }, { data: recs }] = await Promise.all([
        supabase.from('workers').select('id, full_name').in('id', ids).order('full_name'),
        supabase
          .from('picking_records')
          .select('worker_id, quantity')
          .in('worker_id', ids)
          .eq('work_day', workDay)
          .is('original_record_id', null),
      ]);
      const nameById = Object.fromEntries((ws || []).map((w: any) => [w.id, w.full_name]));
      const unitsByWorker: Record<string, number> = {};
      for (const r of recs || []) unitsByWorker[r.worker_id] = (unitsByWorker[r.worker_id] ?? 0) + Number(r.quantity);

      return (roster || [])
        .map((r) => ({
          rosterId: r.id,
          workerId: r.worker_id,
          fullName: nameById[r.worker_id] ?? 'Trabajador',
          units: unitsByWorker[r.worker_id] ?? 0,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)) as RosterMember[];
    },
  });

  const members = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.workerId)), [members]);

  // Trabajadores disponibles para agregar: activos con rol worker. Los de la
  // cuadrilla base ("su gente habitual") se muestran primero como referencia.
  const availableQuery = useQuery({
    queryKey: ['roster-available', baseCrewId],
    enabled: showAdd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, crew_id')
        .eq('role', 'worker')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return (data || []) as { id: string; full_name: string; crew_id: string | null }[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (workerId: string) => {
      // organization_id y work_day los completan los triggers del servidor;
      // lead_id/added_by deben ser el responsable (validado por RLS).
      const { error } = await supabase.from('day_roster').insert({
        worker_id: workerId,
        lead_id: leadId,
        crew_id: crewId,
        added_by: leadId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      Haptics.selectionAsync();
      await rosterQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['production'] });
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // El error más común es el UNIQUE: el trabajador ya está con otro responsable hoy.
      const msg = /duplicate|unique/i.test(e?.message || '')
        ? 'Este trabajador ya está en el equipo de otro responsable hoy.'
        : e?.message || 'No se pudo agregar';
      Alert.alert('No se pudo agregar', msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (rosterId: string) => {
      const { error } = await supabase.from('day_roster').delete().eq('id', rosterId);
      if (error) throw error;
    },
    onSuccess: async () => {
      Haptics.selectionAsync();
      await rosterQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['production'] });
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Si ya registró producción, la FK ON DELETE RESTRICT impide quitarlo.
      const msg = /violates foreign key|restrict/i.test(e?.message || '')
        ? 'No se puede quitar: este trabajador ya tiene producción registrada hoy.'
        : e?.message || 'No se pudo quitar';
      Alert.alert('No se pudo quitar', msg);
    },
  });

  const confirmRemove = useCallback(
    (m: RosterMember) => {
      Alert.alert('Quitar del equipo', `¿Quitar a ${m.fullName} del equipo de hoy?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => removeMutation.mutate(m.rosterId) },
      ]);
    },
    [removeMutation],
  );

  const clearAll = useCallback(() => {
    if (members.length === 0) return;
    Alert.alert('Vaciar equipo', `¿Quitar a los ${members.length} trabajadores del equipo de hoy?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Vaciar',
        style: 'destructive',
        onPress: async () => {
          // Secuencial para respetar la RLS y capturar el primer error (p.ej. producción registrada).
          for (const m of members) {
            try {
              await removeMutation.mutateAsync(m.rosterId);
            } catch {
              break;
            }
          }
        },
      },
    ]);
  }, [members, removeMutation]);

  const filteredAvailable = useMemo(() => {
    const all = (availableQuery.data ?? []).filter((w) => !memberIds.has(w.id));
    const q = search.trim().toLowerCase();
    const matched = q ? all.filter((w) => w.full_name.toLowerCase().includes(q)) : all;
    // "Su gente habitual" (cuadrilla base) primero.
    return [...matched].sort((a, b) => {
      const aBase = baseCrewId && a.crew_id === baseCrewId ? 0 : 1;
      const bBase = baseCrewId && b.crew_id === baseCrewId ? 0 : 1;
      if (aBase !== bBase) return aBase - bBase;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [availableQuery.data, memberIds, search, baseCrewId]);

  return (
    <>
      <View style={s.header}>
        <Text style={s.title}>Equipo de hoy</Text>
        <Text style={s.count}>{members.length}</Text>
      </View>
      <Text style={s.subtitle}>{formatToday(workDay)}</Text>

      <View style={s.actionsRow}>
        <TouchableOpacity style={s.addBtn} onPress={() => { setSearch(''); setShowAdd(true); }} activeOpacity={0.85}>
          <Ionicons name="person-add-outline" size={16} color={colors.textWhite} />
          <Text style={s.addBtnText}>Agregar</Text>
        </TouchableOpacity>
        {members.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={clearAll} activeOpacity={0.85}>
            <Ionicons name="trash-outline" size={16} color={colors.red} />
            <Text style={s.clearBtnText}>Vaciar</Text>
          </TouchableOpacity>
        )}
      </View>

      {rosterQuery.isLoading ? (
        <View style={s.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : members.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="people-outline" size={22} color={colors.textMuted} />
          <Text style={s.emptyText}>
            Aún no has armado tu equipo de hoy. Toca “Agregar” para incluir a los trabajadores de esta jornada.
          </Text>
        </View>
      ) : (
        members.map((m) => (
          <View key={m.rosterId} style={s.memberRow}>
            <View style={s.memberAvatar}><Text style={s.memberAvatarText}>{m.fullName.charAt(0) || '?'}</Text></View>
            <Text style={s.memberName}>{m.fullName}</Text>
            <Text style={s.memberUnits}>{m.units} hoy</Text>
            <TouchableOpacity onPress={() => confirmRemove(m)} hitSlop={8} style={s.removeIcon}>
              <Ionicons name="close-circle" size={20} color={colors.red} />
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Modal: agregar trabajadores */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAdd(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Agregar al equipo de hoy</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.searchRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Buscar trabajador…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
            </View>

            {availableQuery.isLoading ? (
              <View style={s.loading}><ActivityIndicator color={colors.primary} /></View>
            ) : (
              <FlatList
                data={filteredAvailable}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: spacing.xl }}
                renderItem={({ item }) => {
                  const isBase = !!baseCrewId && item.crew_id === baseCrewId;
                  return (
                    <TouchableOpacity
                      style={s.availRow}
                      onPress={() => addMutation.mutate(item.id)}
                      disabled={addMutation.isPending}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                      <Text style={s.availName}>{item.full_name}</Text>
                      {isBase && <View style={s.baseTag}><Text style={s.baseTagText}>Mi cuadrilla</Text></View>}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={s.emptyCard}>
                    <Text style={s.emptyText}>
                      {search.trim()
                        ? 'Ningún trabajador coincide con la búsqueda.'
                        : 'No hay trabajadores disponibles para agregar.'}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

type RosterMember = { rosterId: string; workerId: string; fullName: string; units: number };

function formatToday(isoDate: string): string {
  // isoDate viene 'YYYY-MM-DD' en zona del tenant; formateo legible sin zona local.
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  count: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  subtitle: { fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.lg, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  addBtnText: { color: colors.textWhite, fontSize: 13, fontWeight: font.semibold },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  clearBtnText: { color: colors.red, fontSize: 13, fontWeight: font.semibold },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder },
  emptyText: { flex: 1, fontSize: 13, color: colors.textMuted },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  memberAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 14, fontWeight: font.bold, color: colors.primary },
  memberName: { flex: 1, fontSize: 14, fontWeight: font.medium, color: colors.text },
  memberUnits: { fontSize: 13, fontWeight: font.semibold, color: colors.primary },
  removeIcon: { paddingLeft: spacing.xs },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitle: { fontSize: 16, fontWeight: font.bold, color: colors.text },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  availName: { flex: 1, fontSize: 14, fontWeight: font.medium, color: colors.text },
  baseTag: { backgroundColor: colors.primaryBg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  baseTagText: { fontSize: 11, fontWeight: font.semibold, color: colors.primary },
});
