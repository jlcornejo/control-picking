import { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { localDate } from '../../src/utils/date';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';

/**
 * Pantalla del Supervisor — "Mi Equipo".
 * Muestra las cuadrillas que supervisa (con su encargado) y los trabajadores
 * asignados directamente, con su producción del día. RLS acota a su ámbito.
 */
export default function TeamScreen() {
  const { worker } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Cuadrillas a cargo del supervisor (crews.supervisor_id = él) + su encargado.
  const { data: crews, refetch: refetchCrews } = useQuery({
    queryKey: ['sup-crews', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('crews')
        .select('id, name, crew_lead_id')
        .eq('supervisor_id', worker!.id)
        .eq('status', 'active')
        .order('name');
      const leadIds = [...new Set((data || []).map(c => c.crew_lead_id).filter(Boolean))];
      let leadMap: Record<string, string> = {};
      if (leadIds.length > 0) {
        const { data: leads } = await supabase.from('workers').select('id, full_name').in('id', leadIds);
        leadMap = Object.fromEntries((leads || []).map(l => [l.id, l.full_name]));
      }
      return (data || []).map(c => ({ ...c, lead_name: leadMap[c.crew_lead_id] || '—' }));
    },
  });

  // Trabajadores asignados directamente al supervisor + su producción del día.
  const { data: workers, isLoading, refetch: refetchWorkers } = useQuery({
    queryKey: ['sup-workers', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const { data: assigns } = await supabase
        .from('supervisor_assignments')
        .select('worker_id')
        .eq('supervisor_id', worker!.id)
        .not('worker_id', 'is', null);
      const ids = [...new Set((assigns || []).map((a: any) => a.worker_id))];
      if (ids.length === 0) return [];
      const { data: ws } = await supabase.from('workers').select('id, full_name').in('id', ids).order('full_name');
      const { data: recs } = await supabase
        .from('picking_records')
        .select('worker_id, quantity')
        .in('worker_id', ids)
        .eq('work_day', localDate(0))
        .is('original_record_id', null);
      const unitsByWorker: Record<string, number> = {};
      for (const r of recs || []) unitsByWorker[r.worker_id] = (unitsByWorker[r.worker_id] ?? 0) + Number(r.quantity);
      return (ws || []).map((w: any) => ({ ...w, units: unitsByWorker[w.id] ?? 0 }));
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchCrews(), refetchWorkers()]);
    setRefreshing(false);
  }, [refetchCrews, refetchWorkers]);

  const hasCrews = (crews || []).length > 0;
  const hasWorkers = (workers || []).length > 0;

  return (
    <FlatList
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      data={workers || []}
      keyExtractor={(item: any) => item.id}
      contentContainerStyle={{ paddingBottom: 120 }}
      ListHeaderComponent={
        <>
          {hasCrews && (
            <>
              <Text style={s.sectionTitle}>Cuadrillas a mi cargo</Text>
              {(crews || []).map((c: any) => (
                <View key={c.id} style={s.crewRow}>
                  <View style={s.crewIcon}><Ionicons name="car-outline" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.crewName}>{c.name}</Text>
                    <Text style={s.crewLead}>Encargado: {c.lead_name}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
          <Text style={s.sectionTitle}>Trabajadores asignados</Text>
        </>
      }
      renderItem={({ item }: { item: any }) => (
        <View style={s.memberRow}>
          <View style={s.memberAvatar}><Text style={s.memberAvatarText}>{item.full_name?.charAt(0) || '?'}</Text></View>
          <Text style={s.memberName}>{item.full_name}</Text>
          <Text style={s.memberUnits}>{item.units} hoy</Text>
        </View>
      )}
      ListEmptyComponent={
        isLoading ? <ListSkeleton count={4} /> : (
          !hasCrews && !hasWorkers ? (
            <EmptyState
              icon="people-outline"
              title="Sin equipo asignado"
              message="Aún no tienes cuadrillas ni trabajadores asignados. El administrador los asigna desde la web."
              iconColor={colors.primary}
            />
          ) : (
            <View style={s.emptyInline}><Text style={s.emptyInlineText}>Sin trabajadores asignados directamente.</Text></View>
          )
        )
      }
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  crewIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  crewName: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  crewLead: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  memberAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 14, fontWeight: font.bold, color: colors.primary },
  memberName: { flex: 1, fontSize: 14, fontWeight: font.medium, color: colors.text },
  memberUnits: { fontSize: 13, fontWeight: font.semibold, color: colors.primary },
  emptyInline: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emptyInlineText: { fontSize: 13, color: colors.textMuted },
});
