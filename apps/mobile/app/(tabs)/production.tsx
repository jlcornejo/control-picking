import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet, PanResponder, Modal as RNModal, TextInput, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { localDate } from '../../src/utils/date';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ListSkeleton, ProductionHeaderSkeleton } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { AnimatedCard } from '../../src/components/AnimatedCard';

export default function ProductionScreen() {
  const { worker } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const selectedDate = localDate(dayOffset);
  const isToday = dayOffset === 0;
  const isAdmin = worker?.role === 'admin' || worker?.role === 'supervisor';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['production', selectedDate, worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      let query = supabase
        .from('picking_records')
        .select('id, quantity, rate_amount_snapshot, recorded_at, work_day, block_id, worker_id')
        .eq('work_day', selectedDate)
        .is('original_record_id', null)
        .order('recorded_at', { ascending: false });

      if (worker?.role === 'worker') {
        query = query.eq('worker_id', worker.id);
      }

      const { data: records, error } = await query;
      if (error) throw error;

      // Get block names + product info + field info
      const blockIds = [...new Set((records || []).map(r => r.block_id))];
      let blockMap: Record<string, { name: string; unit: string; product: string; field: string }> = {};
      if (blockIds.length > 0) {
        const { data: blocks } = await supabase
          .from('blocks')
          .select('id, name, field_id, fields(name), products(name, unit_measure)')
          .in('id', blockIds);
        blockMap = Object.fromEntries((blocks || []).map((b: any) => [b.id, {
          name: b.name,
          unit: b.products?.unit_measure || 'box',
          product: b.products?.name || '—',
          field: b.fields?.name || '—',
        }]));
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
        product: blockMap[r.block_id]?.product || '—',
        field_name: blockMap[r.block_id]?.field || '—',
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

  // Corrección de un registro (soft-update, solo misma jornada, roles de terreno).
  const queryClient = useQueryClient();
  const [correctRecord, setCorrectRecord] = useState<any | null>(null);
  const [correctQty, setCorrectQty] = useState('');
  const canCorrect = worker?.role === 'admin' || worker?.role === 'supervisor' || worker?.role === 'crew_lead';

  const correctMutation = useMutation({
    mutationFn: async () => {
      if (!correctRecord) throw new Error('Sin registro');
      const qty = parseFloat(correctQty);
      if (!qty || qty <= 0) throw new Error('La cantidad debe ser mayor a 0');
      if (correctRecord.work_day !== localDate(0)) throw new Error('Solo se puede corregir un registro del día actual');

      // 1) Snapshot de auditoría con los valores VIEJOS, apuntando al original.
      //    organization_id lo completa el trigger set_organization_id.
      const { error: snapErr } = await supabase.from('picking_records').insert({
        worker_id: correctRecord.worker_id,
        block_id: correctRecord.block_id,
        quantity: correctRecord.quantity,
        rate_amount_snapshot: correctRecord.rate_amount_snapshot,
        work_day: correctRecord.work_day,
        recorded_by: worker?.id,
        original_record_id: correctRecord.id,
      });
      if (snapErr) throw snapErr;

      // 2) Editar el original in-place con la nueva cantidad (conserva la tarifa).
      const { error: updErr } = await supabase.from('picking_records')
        .update({ quantity: qty })
        .eq('id', correctRecord.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCorrectRecord(null); setCorrectQty(''); setSelectedRecord(null);
      queryClient.invalidateQueries({ queryKey: ['production'] });
      Alert.alert('✅ Registro corregido');
    },
    onError: (err: any) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', err.message); },
  });

  // Swipe gesture for day navigation
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dy) < 30,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 50) {
          // Swipe right → previous day
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDayOffset(prev => prev - 1);
        } else if (gestureState.dx < -50 && dayOffset < 0) {
          // Swipe left → next day (only if not today)
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDayOffset(prev => Math.min(0, prev + 1));
        }
      },
    })
  ).current;

  const unitLabel = data?.hasBoxes && data?.hasKg ? 'unidades' : data?.hasKg ? 'kilos' : 'cajas';

  return (
    <View style={s.container}>
      {/* Summary header */}
      <LinearGradient colors={['#047857', '#059669', '#10b981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
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
      </LinearGradient>

      {/* Day navigation */}
      <View style={s.dayNav} {...panResponder.panHandlers}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDayOffset(dayOffset - 1); }} style={s.dayBtn} activeOpacity={0.7}>
          <Text style={s.dayBtnText}>‹ Ayer</Text>
        </TouchableOpacity>
        <View style={s.dayCenter}>
          <Text style={s.dayDate}>{isToday ? 'Hoy' : selectedDate}</Text>
          {isToday && <View style={s.liveDot} />}
        </View>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDayOffset(Math.min(0, dayOffset + 1)); }} disabled={isToday} style={[s.dayBtn, isToday && { opacity: 0.3 }]} activeOpacity={0.7}>
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
        renderItem={({ item, index }: { item: any; index: number }) => (
          <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedRecord(item)}>
          <AnimatedCard index={index} style={s.card}>
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
          </AnimatedCard>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton count={4} />
          ) : (
            <EmptyState
              icon="cube-outline"
              title="Sin registros"
              message={`No hay producción registrada ${isToday ? 'hoy' : 'este día'}. Los registros aparecerán aquí cuando se escaneen badges.`}
              iconColor={colors.primary}
            />
          )
        }
      />

      {/* Record Detail Modal */}
      <RNModal visible={!!selectedRecord} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSelectedRecord(null)} />
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Detalle del registro</Text>
              <TouchableOpacity onPress={() => setSelectedRecord(null)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {selectedRecord && (
              <View style={s.detailBody}>
                {/* Amount highlight */}
                <View style={s.detailHighlight}>
                  <Text style={s.detailHighlightQty}>{Number(selectedRecord.quantity)}</Text>
                  <Text style={s.detailHighlightUnit}>{selectedRecord.unit === 'kg' ? 'kilos' : 'cajas'}</Text>
                  <Text style={s.detailHighlightAmount}>{formatMoney(Number(selectedRecord.quantity) * Number(selectedRecord.rate_amount_snapshot))}</Text>
                </View>

                {/* Detail rows */}
                <View style={s.detailRows}>
                  <DetailRow icon="leaf-outline" label="Producto" value={selectedRecord.product} />
                  <DetailRow icon="grid-outline" label="Paño" value={selectedRecord.block_name} />
                  <DetailRow icon="map-outline" label="Campo" value={selectedRecord.field_name} />
                  <DetailRow icon="cash-outline" label="Tarifa" value={`${formatMoney(Number(selectedRecord.rate_amount_snapshot))} / ${selectedRecord.unit === 'kg' ? 'kg' : 'caja'}`} />
                  <DetailRow icon="time-outline" label="Hora" value={new Date(selectedRecord.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
                  <DetailRow icon="calendar-outline" label="Fecha" value={selectedRecord.work_day} />
                  {selectedRecord.worker_name ? <DetailRow icon="person-outline" label="Trabajador" value={selectedRecord.worker_name} /> : null}
                </View>

                {/* Corregir: solo registros del día actual y roles de terreno */}
                {canCorrect && selectedRecord.work_day === localDate(0) && (
                  <TouchableOpacity
                    style={s.correctBtn}
                    onPress={() => { setCorrectQty(String(Number(selectedRecord.quantity))); setCorrectRecord(selectedRecord); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.primary} />
                    <Text style={s.correctBtnText}>Corregir cantidad</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </RNModal>

      {/* Correction Modal */}
      <RNModal visible={!!correctRecord} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setCorrectRecord(null); setCorrectQty(''); }} />
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Corregir registro</Text>
              <TouchableOpacity onPress={() => { setCorrectRecord(null); setCorrectQty(''); }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {correctRecord && (
              <View style={{ paddingBottom: 8 }}>
                <Text style={s.correctInfo}>
                  {correctRecord.worker_name ? `${correctRecord.worker_name} · ` : ''}{correctRecord.block_name}
                </Text>
                <Text style={s.correctInfoSub}>Cantidad actual: {Number(correctRecord.quantity)} {correctRecord.unit === 'kg' ? 'kg' : 'cajas'}</Text>
                <Text style={s.correctLabel}>Nueva cantidad</Text>
                <TextInput
                  style={s.correctInput}
                  value={correctQty}
                  onChangeText={setCorrectQty}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={s.correctHint}>Se conserva el registro original como auditoría. Solo se puede corregir el día actual.</Text>
                <TouchableOpacity
                  style={[s.correctConfirm, (!correctQty || parseFloat(correctQty) <= 0 || correctMutation.isPending) && { opacity: 0.5 }]}
                  onPress={() => correctMutation.mutate()}
                  disabled={!correctQty || parseFloat(correctQty) <= 0 || correctMutation.isPending}
                  activeOpacity={0.85}
                >
                  <Text style={s.correctConfirmText}>{correctMutation.isPending ? 'Guardando...' : '✓ Guardar corrección'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </RNModal>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <View style={s.detailRowLeft}>
        <Ionicons name={icon as any} size={16} color={colors.textMuted} />
        <Text style={s.detailRowLabel}>{label}</Text>
      </View>
      <Text style={s.detailRowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, paddingTop: 56, borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl },
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
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
  detailBody: { gap: spacing.lg },
  detailHighlight: { alignItems: 'center', backgroundColor: colors.primaryBg, borderRadius: radius.xl, paddingVertical: spacing.xl },
  detailHighlightQty: { fontSize: 48, fontWeight: font.extrabold, color: colors.primary },
  detailHighlightUnit: { fontSize: 14, color: colors.textSecondary, marginTop: -4 },
  detailHighlightAmount: { fontSize: 18, fontWeight: font.bold, color: colors.primaryDark, marginTop: spacing.sm },
  detailRows: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  detailRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailRowLabel: { fontSize: 13, color: colors.textSecondary },
  detailRowValue: { fontSize: 13, fontWeight: font.semibold, color: colors.text, maxWidth: '50%', textAlign: 'right' },
  // Correction
  correctBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primaryMuted, backgroundColor: colors.primaryBg, borderRadius: radius.lg, paddingVertical: 14 },
  correctBtnText: { fontSize: 15, fontWeight: font.semibold, color: colors.primary },
  correctInfo: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  correctInfoSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  correctLabel: { fontSize: 13, fontWeight: font.medium, color: colors.textMuted, marginTop: spacing.lg, marginBottom: 6 },
  correctInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
  correctHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  correctConfirm: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: spacing.lg },
  correctConfirmText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
});
