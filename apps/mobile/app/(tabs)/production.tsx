import { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { localDate } from '../../src/utils/date';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function ProductionScreen() {
  const { worker } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const selectedDate = localDate(dayOffset);
  const isToday = dayOffset === 0;
  const isAdmin = worker?.role === 'admin' || worker?.role === 'supervisor';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['production', selectedDate, worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      let query = supabase
        .from('picking_records')
        .select('id, quantity, rate_amount_snapshot, recorded_at, block_id, worker_id')
        .eq('work_day', selectedDate)
        .is('original_record_id', null)
        .order('recorded_at', { ascending: false });

      if (worker?.role === 'worker') {
        query = query.eq('worker_id', worker.id);
      }

      const { data: records, error } = await query;
      if (error) throw error;

      // Get block names + product info
      const blockIds = [...new Set((records || []).map(r => r.block_id))];
      let blockMap: Record<string, { name: string; unit: string }> = {};
      if (blockIds.length > 0) {
        const { data: blocks } = await supabase.from('blocks').select('id, name, products(unit_measure)').in('id', blockIds);
        blockMap = Object.fromEntries((blocks || []).map((b: any) => [b.id, { name: b.name, unit: b.products?.unit_measure || 'box' }]));
      }

      // Get worker names (admin/supervisor)
      const workerIds = [...new Set((records || []).map(r => r.worker_id))];
      let workerMap: Record<string, string> = {};
      if (workerIds.length > 0 && worker?.role !== 'worker') {
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
      }

      const enriched = (records || []).map(r => ({
        ...r,
        block_name: blockMap[r.block_id]?.name || '—',
        unit: blockMap[r.block_id]?.unit || 'box',
        worker_name: workerMap[r.worker_id] || '',
      }));

      return {
        records: enriched,
        totalUnits: enriched.reduce((s, r) => s + Number(r.quantity), 0),
        totalEarnings: enriched.reduce((s, r) => s + Number(r.quantity) * Number(r.rate_amount_snapshot), 0),
        hasBoxes: enriched.some(r => r.unit === 'box'),
        hasKg: enriched.some(r => r.unit === 'kg'),
      };
    },
    refetchInterval: isToday ? 15000 : undefined,
  });

  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  const unitLabel = data?.hasBoxes && data?.hasKg ? 'unidades' : data?.hasKg ? 'kilos' : 'cajas';

  return (
    <View style={s.container}>
      {/* Summary header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerStat}>
            <Text style={s.headerValue}>{formatNumber(data?.totalUnits || 0)}</Text>
            <Text style={s.headerUnit}>{unitLabel}</Text>
          </View>
          <View style={s.headerDivider} />
          <View style={s.headerStat}>
            <Text style={s.headerMoney}>{formatMoney(data?.totalEarnings || 0)}</Text>
            <Text style={s.headerUnit}>estimado</Text>
          </View>
        </View>
      </View>

      {/* Day navigation */}
      <View style={s.dayNav}>
        <TouchableOpacity onPress={() => setDayOffset(dayOffset - 1)} style={s.dayBtn} activeOpacity={0.7}>
          <Text style={s.dayBtnText}>‹ Ayer</Text>
        </TouchableOpacity>
        <View style={s.dayCenter}>
          <Text style={s.dayDate}>{isToday ? 'Hoy' : selectedDate}</Text>
          {isToday && <View style={s.liveDot} />}
        </View>
        <TouchableOpacity onPress={() => setDayOffset(Math.min(0, dayOffset + 1))} disabled={isToday} style={[s.dayBtn, isToday && { opacity: 0.3 }]} activeOpacity={0.7}>
          <Text style={s.dayBtnText}>Mañana ›</Text>
        </TouchableOpacity>
      </View>

      {/* Records */}
      <FlatList
        data={data?.records || []}
        keyExtractor={(item: any) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Text style={s.listTitle}>Registros</Text>
            <Text style={s.listCount}>{data?.records.length || 0}</Text>
          </View>
        }
        renderItem={({ item }: { item: any }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              {item.worker_name ? <Text style={s.cardWorker}>{item.worker_name}</Text> : null}
              <Text style={s.cardBlock}>{item.block_name}</Text>
              <Text style={s.cardTime}>{new Date(item.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <View style={s.cardRight}>
              <Text style={s.cardQty}>{Number(item.quantity)}</Text>
              <Text style={s.cardUnit}>{item.unit === 'kg' ? 'kg' : 'cj'}</Text>
              <Text style={s.cardEarn}>{formatMoney(Number(item.quantity) * Number(item.rate_amount_snapshot))}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
            <Text style={s.emptyText}>{isLoading ? 'Cargando...' : 'Sin registros'}</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  headerStat: { alignItems: 'center' },
  headerValue: { fontSize: 36, fontWeight: font.extrabold, color: colors.textWhite },
  headerMoney: { fontSize: 22, fontWeight: font.bold, color: colors.textWhite },
  headerUnit: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  headerDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dayBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  dayBtnText: { fontSize: 13, color: colors.textSecondary, fontWeight: font.medium },
  dayCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayDate: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, marginTop: spacing.sm },
  listTitle: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  listCount: { fontSize: 12, fontWeight: font.semibold, color: colors.textMuted, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  cardWorker: { fontSize: 12, fontWeight: font.bold, color: colors.primary, marginBottom: 2 },
  cardBlock: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  cardTime: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  cardRight: { alignItems: 'flex-end' },
  cardQty: { fontSize: 24, fontWeight: font.extrabold, color: colors.primary },
  cardUnit: { fontSize: 11, color: colors.textMuted, marginTop: -2 },
  cardEarn: { fontSize: 12, fontWeight: font.semibold, color: colors.primaryDark, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
