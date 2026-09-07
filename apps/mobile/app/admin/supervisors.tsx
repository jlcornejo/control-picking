import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  Modal, ScrollView, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { RowItem } from '../../src/components/form/FormControls';

type SupervisorRow = { id: string; full_name: string; phone: string | null; status: string };

export default function AdminSupervisorsScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [assignTarget, setAssignTarget] = useState<SupervisorRow | null>(null);

  const { data: supervisors, isLoading, refetch } = useQuery({
    queryKey: ['admin-supervisors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, phone, status')
        .eq('role', 'supervisor')
        .order('full_name');
      if (error) throw error;

      // Contar asignaciones por supervisor (trabajadores y paños).
      const results = [];
      for (const sup of data || []) {
        const { data: assigns } = await supabase
          .from('supervisor_assignments')
          .select('worker_id, block_id')
          .eq('supervisor_id', sup.id);
        const workers = (assigns || []).filter((a) => a.worker_id).length;
        const blocks = (assigns || []).filter((a) => a.block_id).length;
        results.push({ ...sup, workerCount: workers, blockCount: blocks });
      }
      return results as (SupervisorRow & { workerCount: number; blockCount: number })[];
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={s.container}>
      <FlatList
        data={supervisors || []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <RowItem
            title={item.full_name}
            subtitle={`${item.workerCount} trabajador${item.workerCount === 1 ? '' : 'es'} · ${item.blockCount} paño${item.blockCount === 1 ? '' : 's'}`}
            icon="shield-checkmark"
            iconColor={colors.orange}
            right={
              <TouchableOpacity style={s.manageBtn} onPress={() => setAssignTarget(item)}>
                <Text style={s.manageBtnText}>Gestionar</Text>
              </TouchableOpacity>
            }
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton count={4} />
          ) : (
            <EmptyState
              icon="shield-outline"
              title="Sin supervisores"
              message="Crea trabajadores con rol Supervisor en el módulo Trabajadores."
              iconColor={colors.orange}
            />
          )
        }
      />

      <AssignmentModal
        supervisor={assignTarget}
        onClose={() => setAssignTarget(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['admin-supervisors'] })}
      />
    </View>
  );
}

function AssignmentModal({
  supervisor, onClose, onChanged,
}: {
  supervisor: SupervisorRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<'workers' | 'blocks'>('workers');

  const key = supervisor?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (supervisor && key !== lastKey) {
    setLastKey(key);
    setTab('workers');
  }

  // Asignaciones actuales (trabajadores y paños) con nombres resueltos.
  const { data: assignments, refetch } = useQuery({
    queryKey: ['sup-assignments', supervisor?.id],
    enabled: !!supervisor?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('supervisor_assignments')
        .select('id, worker_id, block_id')
        .eq('supervisor_id', supervisor!.id);
      const rows = data || [];
      const workerIds = rows.filter((a) => a.worker_id).map((a) => a.worker_id as string);
      const blockIds = rows.filter((a) => a.block_id).map((a) => a.block_id as string);

      let workerMap: Record<string, string> = {};
      let blockMap: Record<string, { name: string; field: string }> = {};
      if (workerIds.length > 0) {
        const { data: ws } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        workerMap = Object.fromEntries((ws || []).map((w) => [w.id, w.full_name]));
      }
      if (blockIds.length > 0) {
        const { data: bs } = await supabase.from('blocks').select('id, name, fields(name)').in('id', blockIds);
        blockMap = Object.fromEntries((bs || []).map((b: any) => [b.id, { name: b.name, field: b.fields?.name || '' }]));
      }
      return {
        workers: rows.filter((a) => a.worker_id).map((a) => ({ id: a.id, worker_id: a.worker_id as string, name: workerMap[a.worker_id as string] || '—' })),
        blocks: rows.filter((a) => a.block_id).map((a) => ({ id: a.id, block_id: a.block_id as string, name: blockMap[a.block_id as string]?.name || '—', field: blockMap[a.block_id as string]?.field || '' })),
      };
    },
  });

  // Trabajadores disponibles (rol worker, activos, no asignados a este supervisor).
  const { data: availableWorkers } = useQuery({
    queryKey: ['sup-available-workers', supervisor?.id, assignments?.workers?.length],
    enabled: !!supervisor?.id && !!assignments,
    queryFn: async () => {
      const { data } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('role', 'worker')
        .eq('status', 'active')
        .order('full_name');
      const assigned = (assignments?.workers || []).map((a) => a.worker_id);
      return (data || []).filter((w) => !assigned.includes(w.id));
    },
  });

  // Paños disponibles (activos, no asignados a este supervisor).
  const { data: availableBlocks } = useQuery({
    queryKey: ['sup-available-blocks', supervisor?.id, assignments?.blocks?.length],
    enabled: !!supervisor?.id && !!assignments,
    queryFn: async () => {
      const { data } = await supabase
        .from('blocks')
        .select('id, name, fields(name)')
        .eq('status', 'active')
        .order('name');
      const assigned = (assignments?.blocks || []).map((a) => a.block_id);
      return (data || []).filter((b: any) => !assigned.includes(b.id)).map((b: any) => ({ id: b.id, name: b.name, field: b.fields?.name || '' }));
    },
  });

  const assignWorker = useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await supabase.from('supervisor_assignments').insert({ supervisor_id: supervisor!.id, worker_id: workerId });
      if (error) throw error;
    },
    onSuccess: async () => { Haptics.selectionAsync(); await refetch(); onChanged(); },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo asignar'),
  });
  const assignBlock = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase.from('supervisor_assignments').insert({ supervisor_id: supervisor!.id, block_id: blockId });
      if (error) throw error;
    },
    onSuccess: async () => { Haptics.selectionAsync(); await refetch(); onChanged(); },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo asignar'),
  });
  const unassign = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('supervisor_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: async () => { Haptics.selectionAsync(); await refetch(); onChanged(); },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo quitar'),
  });

  return (
    <Modal visible={!!supervisor} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Asignaciones — {supervisor?.full_name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={s.tabs}>
            <TouchableOpacity style={[s.tab, tab === 'workers' && s.tabActive]} onPress={() => setTab('workers')}>
              <Text style={[s.tabText, tab === 'workers' && s.tabTextActive]}>Trabajadores ({assignments?.workers?.length || 0})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, tab === 'blocks' && s.tabActive]} onPress={() => setTab('blocks')}>
              <Text style={[s.tabText, tab === 'blocks' && s.tabTextActive]}>Paños ({assignments?.blocks?.length || 0})</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            {tab === 'workers' ? (
              <>
                <Text style={s.sectionLabel}>ASIGNADOS</Text>
                {(assignments?.workers || []).length === 0 ? (
                  <Text style={s.empty}>Ninguno</Text>
                ) : (
                  (assignments?.workers || []).map((a) => (
                    <View key={a.id} style={[s.assignRow, { backgroundColor: colors.violetBg }]}>
                      <Text style={[s.assignName, { color: colors.violet }]}>{a.name}</Text>
                      <TouchableOpacity onPress={() => unassign.mutate(a.id)}>
                        <Text style={s.removeText}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>AGREGAR</Text>
                {(availableWorkers || []).length === 0 ? (
                  <Text style={s.empty}>No hay trabajadores disponibles.</Text>
                ) : (
                  (availableWorkers || []).map((w) => (
                    <TouchableOpacity key={w.id} style={s.addRow} onPress={() => assignWorker.mutate(w.id)}>
                      <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                      <Text style={s.addName}>{w.full_name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : (
              <>
                <Text style={s.sectionLabel}>ASIGNADOS</Text>
                {(assignments?.blocks || []).length === 0 ? (
                  <Text style={s.empty}>Ninguno</Text>
                ) : (
                  (assignments?.blocks || []).map((a) => (
                    <View key={a.id} style={[s.assignRow, { backgroundColor: colors.amberBg }]}>
                      <Text style={[s.assignName, { color: colors.amber }]}>{a.name}{a.field ? ` · ${a.field}` : ''}</Text>
                      <TouchableOpacity onPress={() => unassign.mutate(a.id)}>
                        <Text style={s.removeText}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>AGREGAR</Text>
                {(availableBlocks || []).length === 0 ? (
                  <Text style={s.empty}>No hay paños disponibles.</Text>
                ) : (
                  (availableBlocks || []).map((b) => (
                    <TouchableOpacity key={b.id} style={s.addRow} onPress={() => assignBlock.mutate(b.id)}>
                      <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                      <Text style={s.addName}>{b.name}{b.field ? ` · ${b.field}` : ''}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  manageBtn: { backgroundColor: colors.primaryBg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  manageBtnText: { fontSize: 13, fontWeight: font.semibold, color: colors.primary },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  sheetTitle: { fontSize: 16, fontWeight: font.bold, color: colors.text, flex: 1 },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, margin: spacing.lg, marginBottom: 0, backgroundColor: colors.surface, borderRadius: radius.md },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: font.medium, color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: font.semibold },
  sectionLabel: { fontSize: 11, fontWeight: font.semibold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm },
  empty: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, marginBottom: spacing.xs },
  assignName: { fontSize: 14, fontWeight: font.medium, flex: 1 },
  removeText: { fontSize: 12, fontWeight: font.semibold, color: colors.red },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  addName: { fontSize: 14, color: colors.text },
});
