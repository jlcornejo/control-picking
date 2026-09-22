import { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DayRosterManager } from '../../src/components/DayRosterManager';

/**
 * Pantalla del Supervisor — "Mi Equipo".
 * Arriba arma su equipo del día (roster de la jornada). Debajo, como referencia,
 * lista las cuadrillas que supervisa con su encargado. RLS acota a su ámbito.
 *
 * El Supervisor arma el roster directo (sin cuadrilla): crew_id = null. No hay
 * "cuadrilla base" propia, así que el buscador lista todos los trabajadores.
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchCrews();
    setRefreshing(false);
  }, [refetchCrews]);

  const hasCrews = (crews || []).length > 0;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Equipo del día: el supervisor arma su roster de la jornada (sin cuadrilla). */}
      {worker?.id && (
        <DayRosterManager leadId={worker.id} crewId={null} baseCrewId={null} />
      )}

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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  crewIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  crewName: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  crewLead: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
