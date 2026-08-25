import { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal as RNModal, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { localDate } from '../../src/utils/date';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { MetricsSkeleton } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { AnimatedNumber } from '../../src/components/AnimatedNumber';

export default function MetricsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; data: any[] } | null>(null);
  const router = useRouter();
  const today = localDate(0);
  const { data: metrics, isLoading: metricsLoading, refetch } = useQuery({
    queryKey: ['mobile-metrics', today],
    queryFn: async () => {
      const { data: records } = await supabase
        .from('picking_records')
        .select('quantity, rate_amount_snapshot, worker_id, block_id')
        .eq('work_day', today)
        .is('original_record_id', null);

      const totalUnits = (records || []).reduce((s, r) => s + Number(r.quantity), 0);
      const totalAmount = (records || []).reduce((s, r) => s + Number(r.quantity) * Number(r.rate_amount_snapshot), 0);
      const activeWorkers = new Set((records || []).map(r => r.worker_id)).size;
      const activeBlocks = new Set((records || []).map(r => r.block_id)).size;

      // Top workers
      const byWorker: Record<string, { id: string; units: number }> = {};
      for (const r of records || []) {
        if (!byWorker[r.worker_id]) byWorker[r.worker_id] = { id: r.worker_id, units: 0 };
        byWorker[r.worker_id]!.units += Number(r.quantity);
      }
      const topWorkerIds = Object.values(byWorker).sort((a, b) => b.units - a.units).slice(0, 5);

      let ranking: { name: string; units: number }[] = [];
      if (topWorkerIds.length > 0) {
        const ids = topWorkerIds.map(w => w.id);
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', ids);
        const nameMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
        ranking = topWorkerIds.map(w => ({ name: nameMap[w.id] || '—', units: w.units }));
      }

      // Pending settlements
      const { data: pendingSettlements } = await supabase
        .from('settlements')
        .select('id, total_amount')
        .in('status', ['pending', 'partial']);
      const pendingIds = (pendingSettlements || []).map(s => s.id);
      let paidOnPending = 0;
      if (pendingIds.length > 0) {
        const { data: pmnts } = await supabase.from('payments').select('amount').in('settlement_id', pendingIds);
        paidOnPending = (pmnts || []).reduce((s, p) => s + Number(p.amount), 0);
      }
      const pendingTotal = (pendingSettlements || []).reduce((s, r) => s + Number(r.total_amount), 0);

      return {
        totalUnits, totalAmount: Math.round(totalAmount), activeWorkers, activeBlocks, ranking,
        pendingAmount: Math.round(pendingTotal - paidOnPending), pendingCount: (pendingSettlements || []).length,
      };
    },
    refetchInterval: 30000,
  });

  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);
  const maxUnits = Math.max(...(metrics?.ranking || []).map(w => w.units), 1);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      {metricsLoading ? (
        <MetricsSkeleton />
      ) : (
      <>
      {/* KPI Cards */}
      <View style={s.kpiRow}>
        <KpiMini icon="cube-outline" value={formatNumber(metrics?.totalUnits || 0)} label="Producción" bg={colors.primaryBg} iconColor={colors.primary} numericValue={metrics?.totalUnits || 0} />
        <KpiMini icon="cash-outline" value={formatMoney(metrics?.totalAmount || 0)} label="Jornada" bg={colors.blueBg} iconColor={colors.blue} numericValue={metrics?.totalAmount || 0} />
      </View>
      <View style={s.kpiRow}>
        <KpiMini icon="people-outline" value={String(metrics?.activeWorkers || 0)} label="Trabajadores" bg={colors.violetBg} iconColor={colors.violet} numericValue={metrics?.activeWorkers || 0} />
        <KpiMini icon="grid-outline" value={String(metrics?.activeBlocks || 0)} label="Paños" bg={colors.amberBg} iconColor={colors.amber} numericValue={metrics?.activeBlocks || 0} />
      </View>

      {/* Pending alert — navigates to payments */}
      {(metrics?.pendingCount || 0) > 0 && (
        <TouchableOpacity style={s.alertCard} onPress={() => router.push('/(tabs)/payments')} activeOpacity={0.8}>
          <View style={s.alertDot} />
          <View style={{ flex: 1 }}>
            <Text style={s.alertTitle}>{metrics?.pendingCount} liquidaciones pendientes</Text>
            <Text style={s.alertValue}>{formatMoney(metrics?.pendingAmount || 0)} por pagar</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color="#92400e" />
        </TouchableOpacity>
      )}

      {/* Ranking */}
      <Text style={s.sectionTitle}>Top del día</Text>
      {(metrics?.ranking || []).length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="Sin producción hoy"
          message="El ranking del día aparecerá cuando los trabajadores registren su cosecha."
          iconColor={colors.amber}
        />
      ) : (
        <View style={s.rankCard}>
          {(metrics?.ranking || []).map((w, i) => (
            <TouchableOpacity key={i} style={[s.rankRow, i < (metrics?.ranking?.length || 0) - 1 && s.rankRowBorder]} activeOpacity={0.7} onPress={() => openWorkerDrill(w)}>
              <View style={[s.rankBadge, i === 0 && s.rankGold, i === 1 && s.rankSilver, i === 2 && s.rankBronze]}>
                <Text style={s.rankNum}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rankName}>{w.name}</Text>
                <View style={s.rankBarBg}>
                  <View style={[s.rankBarFill, { width: `${(w.units / maxUnits) * 100}%` }]} />
                </View>
              </View>
              <Text style={s.rankUnits}>{w.units}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
      </>
      )}

      {/* Drilldown Modal */}
      <RNModal visible={!!drilldown} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDrilldown(null)} />
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{drilldown?.title || ''}</Text>
              <TouchableOpacity onPress={() => setDrilldown(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {drilldown && (
              <>
                <View style={s.modalSummary}>
                  <View style={s.modalSummaryItem}>
                    <Text style={s.modalSummaryValue}>{formatNumber((drilldown.data || []).reduce((s, r) => s + Number(r.quantity), 0))}</Text>
                    <Text style={s.modalSummaryLabel}>cajas</Text>
                  </View>
                  <View style={s.modalSummaryItem}>
                    <Text style={s.modalSummaryValue}>{formatMoney((drilldown.data || []).reduce((s, r) => s + r.total, 0))}</Text>
                    <Text style={s.modalSummaryLabel}>total</Text>
                  </View>
                </View>
                <FlatList
                  data={drilldown.data}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => (
                    <View style={s.modalRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalRowBlock}>{item.block_name}</Text>
                        <Text style={s.modalRowTime}>{new Date(item.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.modalRowQty}>{item.quantity}</Text>
                        <Text style={s.modalRowTotal}>{formatMoney(item.total)}</Text>
                      </View>
                    </View>
                  )}
                />
              </>
            )}
          </View>
        </View>
      </RNModal>
    </ScrollView>
  );

  async function openWorkerDrill(worker: { name: string; units: number }) {
    // Find worker id from ranking data
    const byWorker = metrics?.ranking || [];
    const w = byWorker.find(r => r.name === worker.name);
    if (!w) return;

    // Get worker id
    const { data: workers } = await supabase.from('workers').select('id').eq('full_name', worker.name).single();
    if (!workers) return;

    const { data: records } = await supabase
      .from('picking_records')
      .select('id, quantity, rate_amount_snapshot, recorded_at, block_id')
      .eq('worker_id', workers.id)
      .eq('work_day', today)
      .is('original_record_id', null)
      .order('recorded_at', { ascending: false });

    const blockIds = [...new Set((records || []).map(r => r.block_id))];
    let blockMap: Record<string, string> = {};
    if (blockIds.length > 0) {
      const { data: blocks } = await supabase.from('blocks').select('id, name').in('id', blockIds);
      blockMap = Object.fromEntries((blocks || []).map(b => [b.id, b.name]));
    }

    const enriched = (records || []).map(r => ({
      ...r,
      block_name: blockMap[r.block_id] || '—',
      total: Number(r.quantity) * Number(r.rate_amount_snapshot),
    }));

    setDrilldown({ title: worker.name, data: enriched });
  }
}

function KpiMini({ icon, value, label, bg, iconColor, numericValue }: { icon: string; value: string; label: string; bg: string; iconColor: string; numericValue?: number }) {
  return (
    <View style={s.kpiCard}>
      <LinearGradient
        colors={[bg, `${bg}88`, 'rgba(255,255,255,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.kpiGradient}
      >
        <View style={[s.kpiIconCircle, { backgroundColor: `${iconColor}18` }]}>
          <Ionicons name={icon as any} size={20} color={iconColor} />
        </View>
        {numericValue !== undefined ? (
          <AnimatedNumber
            value={numericValue}
            prefix={value.startsWith('$') ? '$' : ''}
            style={s.kpiValue}
          />
        ) : (
          <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        )}
        <Text style={s.kpiLabel}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 100 },
  kpiRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  kpiCard: { flex: 1, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  kpiGradient: { padding: spacing.lg },
  kpiIconCircle: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  kpiValue: { fontSize: 20, fontWeight: font.extrabold, color: colors.text },
  kpiLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  alertCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.amberBg, borderWidth: 1, borderColor: '#fde68a', borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.md },
  alertDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber },
  alertTitle: { fontSize: 13, fontWeight: font.semibold, color: '#92400e' },
  alertValue: { fontSize: 17, fontWeight: font.bold, color: '#78350f', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: font.bold, color: colors.text, marginBottom: spacing.md, marginTop: spacing.sm },
  rankCard: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  rankRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  rankBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  rankGold: { backgroundColor: '#fef3c7' },
  rankSilver: { backgroundColor: '#f1f5f9' },
  rankBronze: { backgroundColor: '#ffedd5' },
  rankNum: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  rankName: { fontSize: 14, fontWeight: font.semibold, color: colors.text, marginBottom: 4 },
  rankBarBg: { height: 5, backgroundColor: colors.surface, borderRadius: 3, overflow: 'hidden' },
  rankBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  rankUnits: { fontSize: 16, fontWeight: font.extrabold, color: colors.primary, minWidth: 36, textAlign: 'right' },
  emptyCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xxxl, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  emptyText: { fontSize: 14, color: colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: 40, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
  modalSummary: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  modalSummaryItem: { flex: 1, backgroundColor: colors.primaryBg, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  modalSummaryValue: { fontSize: 18, fontWeight: font.extrabold, color: colors.primary },
  modalSummaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  modalRowBlock: { fontSize: 14, fontWeight: font.medium, color: colors.text },
  modalRowTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  modalRowQty: { fontSize: 16, fontWeight: font.bold, color: colors.primary },
  modalRowTotal: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
});
