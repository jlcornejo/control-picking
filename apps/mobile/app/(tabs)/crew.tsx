import { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { localDate } from '../../src/utils/date';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../../src/components/EmptyState';
import { PaymentsSkeleton } from '../../src/components/Skeleton';

const statusLabel: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' };
const statusColor: Record<string, string> = { pending: '#f59e0b', partial: '#f97316', paid: '#22c55e' };

/**
 * Pantalla del Encargado (crew_lead) — "Mi Cuadrilla".
 * Nivel 1: la liquidación que le paga el cliente/campo (payee_type='crew'), solo lectura.
 * Nivel 2 (opcional): liquidaciones individuales de sus trabajadores; puede generarlas
 * y registrar pagos. RLS restringe todo a su propia cuadrilla.
 */
export default function CrewScreen() {
  const { worker } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Liquidación de la cuadrilla (nivel 1: cliente -> encargado)
  const { data: crewSettlements, refetch: refetchCrew } = useQuery({
    queryKey: ['crew-settlement', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('settlements')
        .select('id, period_start, period_end, total_amount, status, crew_id')
        .eq('payee_type', 'crew')
        .order('generated_at', { ascending: false });
      const crewIds = [...new Set((data || []).map(s => s.crew_id).filter(Boolean))];
      let crewMap: Record<string, string> = {};
      if (crewIds.length > 0) {
        const { data: crews } = await supabase.from('crews').select('id, name').in('id', crewIds);
        crewMap = Object.fromEntries((crews || []).map(c => [c.id, c.name]));
      }
      return (data || []).map(s => ({ ...s, crew_name: crewMap[s.crew_id] || 'Mi cuadrilla' }));
    },
  });

  // Liquidaciones de los trabajadores de la cuadrilla (nivel 2)
  const { data: memberSettlements, isLoading, refetch: refetchMembers } = useQuery({
    queryKey: ['crew-member-settlements', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('settlements')
        .select('id, period_start, period_end, total_amount, status, worker_id')
        .eq('payee_type', 'worker')
        .order('generated_at', { ascending: false });

      const workerIds = [...new Set((data || []).map(s => s.worker_id).filter(Boolean))];
      let workerMap: Record<string, string> = {};
      if (workerIds.length > 0) {
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
      }

      const results = [];
      for (const s of data || []) {
        const { data: payments } = await supabase.from('payments').select('amount').eq('settlement_id', s.id);
        const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
        results.push({ ...s, totalPaid, worker_name: workerMap[s.worker_id] || 'Trabajador' });
      }
      return results;
    },
  });

  // Miembros de la cuadrilla con su producción del día (RLS acota a la cuadrilla).
  const { data: members, refetch: refetchTeam } = useQuery({
    queryKey: ['crew-members-list', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const crewId = await currentCrewId();
      if (!crewId) return [];
      const { data: ws } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('crew_id', crewId)
        .eq('status', 'active')
        .order('full_name');
      const ids = (ws || []).map((w: any) => w.id);
      let unitsByWorker: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: recs } = await supabase
          .from('picking_records')
          .select('worker_id, quantity')
          .in('worker_id', ids)
          .eq('work_day', localDate(0))
          .is('original_record_id', null);
        for (const r of recs || []) {
          unitsByWorker[r.worker_id] = (unitsByWorker[r.worker_id] ?? 0) + Number(r.quantity);
        }
      }
      return (ws || []).map((w: any) => ({ ...w, units: unitsByWorker[w.id] ?? 0 }));
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchCrew(), refetchMembers(), refetchTeam()]);
    setRefreshing(false);
  }, [refetchCrew, refetchMembers, refetchTeam]);

  // Generar liquidaciones de nivel 2 para los trabajadores de la cuadrilla.
  // Agrega la producción del período de los miembros en campos con modo capataz.
  const [genFrom, setGenFrom] = useState(localDate(-7));
  const [genTo, setGenTo] = useState(localDate(0));
  const [showGen, setShowGen] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      // Trabajadores de mi cuadrilla (RLS limita a la cuadrilla del encargado).
      const { data: members } = await supabase.from('workers').select('id').eq('crew_id', await currentCrewId());
      const memberIds = (members || []).map((m: any) => m.id);
      if (memberIds.length === 0) throw new Error('Tu cuadrilla no tiene trabajadores');

      // Producción del período de esos trabajadores (registros originales).
      const { data: records } = await supabase
        .from('picking_records')
        .select('worker_id, quantity, rate_amount_snapshot')
        .in('worker_id', memberIds)
        .gte('work_day', genFrom)
        .lte('work_day', genTo)
        .is('original_record_id', null);

      const totals = new Map<string, number>();
      for (const r of records || []) {
        const amount = Number(r.quantity) * Number(r.rate_amount_snapshot);
        if (amount <= 0) continue;
        totals.set(r.worker_id, (totals.get(r.worker_id) ?? 0) + amount);
      }
      if (totals.size === 0) throw new Error('No hay producción de tu cuadrilla en el período');

      let created = 0;
      for (const [workerId, total] of totals) {
        // Evitar duplicados por período.
        const { data: existing } = await supabase
          .from('settlements')
          .select('id')
          .eq('worker_id', workerId)
          .eq('payee_type', 'worker')
          .eq('period_start', genFrom)
          .eq('period_end', genTo)
          .maybeSingle();
        if (existing) continue;

        // organization_id lo completa el trigger set_organization_id; RLS
        // (crew_lead_insert_member_settlements) valida que el worker sea de la cuadrilla.
        const { error } = await supabase.from('settlements').insert({
          payee_type: 'worker',
          worker_id: workerId,
          period_start: genFrom,
          period_end: genTo,
          total_amount: Math.round(total * 100) / 100,
          status: 'pending',
        });
        if (!error) created++;
      }
      return created;
    },
    onSuccess: (created) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowGen(false);
      queryClient.invalidateQueries({ queryKey: ['crew-member-settlements'] });
      Alert.alert(created > 0 ? '✅ Listo' : 'Sin cambios', created > 0 ? `${created} liquidación(es) generada(s)` : 'No había producción nueva para liquidar');
    },
    onError: (err: any) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', err.message); },
  });

  // Pago a un trabajador de la cuadrilla (nivel 2, opcional).
  const [payModal, setPayModal] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payModal) throw new Error('Sin liquidación');
      const amount = parseFloat(payAmount);
      if (!amount || amount <= 0) throw new Error('Monto inválido');
      const remaining = Number(payModal.total_amount) - payModal.totalPaid;
      if (amount > remaining) throw new Error('Monto supera el saldo');

      const { error } = await supabase.from('payments').insert({
        settlement_id: payModal.id,
        worker_id: payModal.worker_id,
        crew_id: null,
        amount,
        notes: payNotes || null,
      });
      if (error) throw error;

      const newPaid = payModal.totalPaid + amount;
      const newStatus = newPaid >= Number(payModal.total_amount) ? 'paid' : 'partial';
      await supabase.from('settlements').update({ status: newStatus }).eq('id', payModal.id);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPayModal(null); setPayAmount(''); setPayNotes('');
      queryClient.invalidateQueries({ queryKey: ['crew-member-settlements'] });
      Alert.alert('✅ Pago registrado');
    },
    onError: (err: any) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', err.message); },
  });

  return <>
    <FlatList
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <>
          {/* Miembros de la cuadrilla y su producción del día */}
          <View style={s.teamHeader}>
            <Text style={s.sectionTitle}>Mi equipo</Text>
            <Text style={s.teamCount}>{(members || []).length}</Text>
          </View>
          {(members || []).length === 0 ? (
            <View style={s.emptyCrew}>
              <Ionicons name="people-outline" size={20} color={colors.textMuted} />
              <Text style={s.emptyCrewText}>Tu cuadrilla aún no tiene trabajadores asignados.</Text>
            </View>
          ) : (
            (members || []).map((m: any) => (
              <View key={m.id} style={s.memberRow}>
                <View style={s.memberAvatar}><Text style={s.memberAvatarText}>{m.full_name?.charAt(0) || '?'}</Text></View>
                <Text style={s.memberName}>{m.full_name}</Text>
                <Text style={s.memberUnits}>{m.units} hoy</Text>
              </View>
            ))
          )}

          {/* Nivel 1: lo que el cliente paga al encargado */}
          <Text style={s.sectionTitle}>Liquidación de mi cuadrilla</Text>
          {(crewSettlements || []).length === 0 ? (
            <View style={s.emptyCrew}>
              <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
              <Text style={s.emptyCrewText}>Aún no hay liquidación de cuadrilla generada por el cliente.</Text>
            </View>
          ) : (
            (crewSettlements || []).map((cs: any) => (
              <View key={cs.id} style={s.crewCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="car-outline" size={16} color={colors.primary} />
                  <Text style={s.crewName}>{cs.crew_name}</Text>
                </View>
                <Text style={s.crewAmount}>${Math.round(Number(cs.total_amount)).toLocaleString()}</Text>
                <Text style={s.crewPeriod}>{cs.period_start} → {cs.period_end}</Text>
                <View style={[s.statusBadge, { backgroundColor: statusColor[cs.status] + '20', alignSelf: 'flex-start', marginTop: 6 }]}>
                  <Text style={[s.statusText, { color: statusColor[cs.status] }]}>{statusLabel[cs.status]}</Text>
                </View>
              </View>
            ))
          )}

          {/* Nivel 2: liquidaciones de los trabajadores del encargado */}
          <View style={s.teamHeader}>
            <Text style={s.sectionTitle}>Liquidaciones de mi equipo</Text>
            <TouchableOpacity style={s.genBtn} onPress={() => setShowGen(true)} activeOpacity={0.8}>
              <Text style={s.genBtnText}>Generar</Text>
            </TouchableOpacity>
          </View>
        </>
      }
      data={memberSettlements || []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 120 }}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.cardWorker}>{item.worker_name}</Text>
            <Text style={s.cardAmount}>${Math.round(Number(item.total_amount)).toLocaleString()}</Text>
          </View>
          <Text style={s.cardPeriod}>{item.period_start} — {item.period_end}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
            <View style={[s.statusBadge, { backgroundColor: statusColor[item.status] + '20' }]}>
              <Text style={[s.statusText, { color: statusColor[item.status] }]}>{statusLabel[item.status]}</Text>
            </View>
            {item.totalPaid > 0 && <Text style={s.paidLabel}>Pagado: {formatMoney(item.totalPaid)}</Text>}
          </View>
          {item.status !== 'paid' && (
            <TouchableOpacity style={s.payBtn} onPress={() => { setPayModal(item); setPayAmount(String(Number(item.total_amount) - item.totalPaid)); }} activeOpacity={0.7}>
              <Text style={s.payBtnText}>Registrar pago</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={
        isLoading ? <PaymentsSkeleton /> : (
          <EmptyState
            icon="people-outline"
            title="Sin liquidaciones de equipo"
            message="Genera las liquidaciones de tu equipo para el período trabajado."
            iconColor={colors.primary}
          />
        )
      }
    />

    {/* Modal generar */}
    <Modal visible={showGen} animationType="slide" transparent>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowGen(false)} />
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Generar liquidaciones del equipo</Text>
          <Text style={s.modalLabel}>Desde (AAAA-MM-DD)</Text>
          <TextInput style={s.modalInput} value={genFrom} onChangeText={setGenFrom} placeholder="2026-01-01" autoCapitalize="none" />
          <Text style={s.modalLabel}>Hasta (AAAA-MM-DD)</Text>
          <TextInput style={s.modalInput} value={genTo} onChangeText={setGenTo} placeholder="2026-01-31" autoCapitalize="none" />
          <View style={s.modalButtons}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowGen(false)}>
              <Text style={s.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalPayBtn} onPress={() => generateMutation.mutate()} disabled={generateMutation.isPending} activeOpacity={0.8}>
              <Text style={s.modalPayText}>{generateMutation.isPending ? '...' : 'Generar'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 20 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Modal pago */}
    <Modal visible={!!payModal} animationType="slide" transparent>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setPayModal(null); setPayAmount(''); setPayNotes(''); }} />
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Registrar pago</Text>
          {payModal && (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.modalWorker}>{payModal.worker_name}</Text>
              <Text style={s.modalPeriod}>{payModal.period_start} — {payModal.period_end}</Text>
              <View style={[s.modalInfoRow, { borderBottomWidth: 0 }]}>
                <Text style={[s.modalInfoLabel, { fontWeight: '700' }]}>Pendiente</Text>
                <Text style={[s.modalInfoValue, { color: colors.primary, fontWeight: '800' }]}>${(Number(payModal.total_amount) - payModal.totalPaid).toLocaleString()}</Text>
              </View>
              <Text style={s.modalLabel}>Monto ($)</Text>
              <TextInput style={s.modalInput} value={payAmount ? formatNumber(payAmount) : ''} onChangeText={(t) => setPayAmount(t.replace(/\./g, ''))} keyboardType="numeric" placeholder="0" selectTextOnFocus />
              <Text style={s.modalLabel}>Notas (opcional)</Text>
              <TextInput style={s.modalInput} value={payNotes} onChangeText={setPayNotes} placeholder="Transferencia, efectivo..." placeholderTextColor="#9ca3af" />
              <View style={s.modalButtons}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => { setPayModal(null); setPayAmount(''); setPayNotes(''); }}>
                  <Text style={s.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalPayBtn} onPress={() => payMutation.mutate()} disabled={payMutation.isPending} activeOpacity={0.8}>
                  <Text style={s.modalPayText}>{payMutation.isPending ? '...' : '✓ Pagar'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

/** Cuadrilla activa del encargado actual (la que lidera). RLS acota crews a la suya. */
async function currentCrewId(): Promise<string | null> {
  const { data } = await supabase.from('crews').select('id').eq('status', 'active').limit(1).maybeSingle();
  return data?.id ?? null;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  emptyCrew: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder },
  emptyCrewText: { flex: 1, fontSize: 13, color: colors.textMuted },
  crewCard: { marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.cardBorder },
  crewName: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  crewAmount: { fontSize: 28, fontWeight: font.extrabold, color: colors.text, marginTop: 4 },
  crewPeriod: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  teamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.lg },
  genBtn: { backgroundColor: colors.primaryBg, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6, marginTop: spacing.lg },
  genBtnText: { color: colors.primary, fontSize: 13, fontWeight: font.semibold },
  teamCount: { fontSize: 13, fontWeight: font.bold, color: colors.primary, marginTop: spacing.lg, marginRight: spacing.lg },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  memberAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 14, fontWeight: font.bold, color: colors.primary },
  memberName: { flex: 1, fontSize: 14, fontWeight: font.medium, color: colors.text },
  memberUnits: { fontSize: 13, fontWeight: font.semibold, color: colors.primary },
  card: { backgroundColor: colors.card, marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  cardWorker: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  cardPeriod: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  cardAmount: { fontSize: 17, fontWeight: font.bold, color: colors.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: font.semibold },
  paidLabel: { fontSize: 12, color: colors.textMuted },
  payBtn: { backgroundColor: colors.primaryBg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7, alignSelf: 'flex-start', marginTop: spacing.sm },
  payBtnText: { color: colors.primary, fontSize: 12, fontWeight: font.semibold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: font.bold, color: colors.text, marginBottom: 12 },
  modalWorker: { fontSize: 16, fontWeight: font.semibold, color: colors.primary },
  modalPeriod: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  modalInfoLabel: { fontSize: 14, color: colors.textMuted },
  modalInfoValue: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  modalLabel: { fontSize: 13, fontWeight: font.medium, color: colors.textMuted, marginTop: 16, marginBottom: 4 },
  modalInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: colors.textMuted, fontSize: 15, fontWeight: font.medium },
  modalPayBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  modalPayText: { color: colors.textWhite, fontSize: 15, fontWeight: font.semibold },
});
