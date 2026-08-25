import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import * as Haptics from 'expo-haptics';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { PaymentsSkeleton } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { PaymentToast } from '../../src/components/PaymentToast';

export default function PaymentsScreen() {
  const { worker } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  // Check for recent payments (last 24h) for workers
  const { data: recentCount } = useQuery({
    queryKey: ['recent-payments-toast', worker?.id],
    enabled: !!worker?.id && worker?.role === 'worker',
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('payments').select('id').eq('worker_id', worker!.id).gte('paid_at', dayAgo);
      return data?.length || 0;
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (recentCount && recentCount > 0) setShowToast(true);
  }, [recentCount]);

  const { data: balance, refetch: refetchBalance } = useQuery({
    queryKey: ['my-balance', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      let query = supabase.from('settlements').select('id, total_amount').in('status', ['pending', 'partial']);
      // Workers see only their own; admin/supervisor sees all
      if (worker?.role === 'worker') {
        query = query.eq('worker_id', worker!.id);
      }
      const { data: settlements } = await query;
      const totalOwed = (settlements || []).reduce((s, r) => s + Number(r.total_amount), 0);
      const ids = (settlements || []).map(s => s.id);
      let totalPaid = 0;
      if (ids.length > 0) {
        const { data: payments } = await supabase.from('payments').select('amount').in('settlement_id', ids);
        totalPaid = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
      }
      return { owed: totalOwed, paid: totalPaid, pending: totalOwed - totalPaid };
    },
  });

  const { data: settlements, isLoading: settlementsLoading, refetch: refetchSettlements } = useQuery({
    queryKey: ['my-settlements', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      let query = supabase.from('settlements').select('id, period_start, period_end, total_amount, status, worker_id').order('generated_at', { ascending: false }).limit(30);
      if (worker?.role === 'worker') {
        query = query.eq('worker_id', worker!.id);
      }
      const { data } = await query;

      // Fetch payments and worker names
      const workerIds = [...new Set((data || []).map(s => s.worker_id))];
      let workerMap: Record<string, string> = {};
      if (workerIds.length > 0 && worker?.role !== 'worker') {
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
      }

      const results = [];
      for (const s of data || []) {
        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount, paid_at, notes')
          .eq('settlement_id', s.id)
          .order('paid_at', { ascending: false });
        const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
        results.push({ ...s, payments: payments || [], totalPaid, worker_name: workerMap[s.worker_id] || '' });
      }
      return results;
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBalance(), refetchSettlements()]);
    setRefreshing(false);
  }, [refetchBalance, refetchSettlements]);

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
        amount,
        notes: payNotes || null,
      });
      if (error) throw error;

      // Update status
      const newPaid = payModal.totalPaid + amount;
      const newStatus = newPaid >= Number(payModal.total_amount) ? 'paid' : 'partial';
      await supabase.from('settlements').update({ status: newStatus }).eq('id', payModal.id);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPayModal(null);
      setPayAmount('');
      setPayNotes('');
      queryClient.invalidateQueries({ queryKey: ['my-balance'] });
      queryClient.invalidateQueries({ queryKey: ['my-settlements'] });
      Alert.alert('✅ Pago registrado');
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message);
    },
  });

  const statusLabel: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' };
  const statusColor: Record<string, string> = { pending: '#f59e0b', partial: '#f97316', paid: '#22c55e' };

  return <>
    <PaymentToast
      visible={showToast}
      count={recentCount || 0}
      onPress={() => setShowToast(false)}
      onDismiss={() => setShowToast(false)}
    />
    <FlatList
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1b5e20" />}
      ListHeaderComponent={
        <>
          <View style={s.hero}>
            <Text style={s.heroLabel}>{worker?.role === 'worker' ? 'Saldo pendiente de cobro' : 'Total pendiente de pago'}</Text>
            <Text style={s.heroValue}>${Math.round(balance?.pending || 0).toLocaleString()}</Text>
            <View style={s.heroFooter}>
              <View>
                <Text style={s.heroSubLabel}>Liquidado</Text>
                <Text style={s.heroSubValue}>${Math.round(balance?.owed || 0).toLocaleString()}</Text>
              </View>
              <View>
                <Text style={s.heroSubLabel}>Pagado</Text>
                <Text style={s.heroSubValue}>${Math.round(balance?.paid || 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>
          <Text style={s.sectionTitle}>{worker?.role === 'worker' ? 'Mis Liquidaciones' : 'Todas las Liquidaciones'}</Text>
        </>
      }
      data={settlements || []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 32 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.card}
          onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                {item.worker_name ? <Text style={s.cardWorker}>{item.worker_name}</Text> : null}
                <Text style={s.cardPeriod}>{item.period_start} — {item.period_end}</Text>
              </View>
              <Text style={s.cardAmount}>${Math.round(Number(item.total_amount)).toLocaleString()}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
              <View style={[s.statusBadge, { backgroundColor: statusColor[item.status] + '20' }]}>
                <Text style={[s.statusText, { color: statusColor[item.status] }]}>{statusLabel[item.status]}</Text>
              </View>
              {item.totalPaid > 0 && (
                <Text style={s.paidLabel}>Pagado: {formatMoney(item.totalPaid)}</Text>
              )}
            </View>
            {item.status !== 'paid' && (
              <View style={s.owedRow}>
                <Text style={s.owedLabel}>Adeudado: {formatMoney(Number(item.total_amount) - item.totalPaid)}</Text>
              </View>
            )}

            {/* Pay button for admin */}
            {worker?.role !== 'worker' && item.status !== 'paid' && (
              <TouchableOpacity style={s.payBtn} onPress={() => { setPayModal(item); setPayAmount(String(Number(item.total_amount) - item.totalPaid)); }} activeOpacity={0.7}>
                <Text style={s.payBtnText}>Pagar</Text>
              </TouchableOpacity>
            )}

            {/* Expanded payment details */}
            {expandedId === item.id && item.payments.length > 0 && (
              <View style={s.paymentsList}>
                <Text style={s.paymentsTitle}>Detalle de pagos</Text>
                {item.payments.map((p: any) => (
                  <View key={p.id} style={s.paymentRow}>
                    <View>
                      <Text style={s.paymentDate}>{new Date(p.paid_at).toLocaleDateString('es-CL')}</Text>
                      {p.notes && <Text style={s.paymentNotes}>{p.notes}</Text>}
                    </View>
                    <Text style={s.paymentAmount}>${Number(p.amount).toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}
            {expandedId === item.id && item.payments.length === 0 && (
              <View style={s.paymentsList}>
                <Text style={s.paymentsEmpty}>Sin pagos registrados</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        settlementsLoading ? (
          <PaymentsSkeleton />
        ) : (
          <EmptyState
            icon="wallet-outline"
            title="Sin liquidaciones"
            message={worker?.role === 'worker' ? 'Cuando se genere una liquidación de tu producción, aparecerá aquí.' : 'No hay liquidaciones pendientes ni pagadas aún.'}
            iconColor="#059669"
          />
        )
      }
    />

    {/* Payment Modal */}
    <Modal visible={!!payModal} animationType="slide" transparent>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setPayModal(null); setPayAmount(''); setPayNotes(''); }} />
        <View style={s.modalContent}>
          <Text style={s.modalTitle}>Registrar Pago</Text>
          {payModal && (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.modalWorker}>{payModal.worker_name || 'Trabajador'}</Text>
              <Text style={s.modalPeriod}>{payModal.period_start} — {payModal.period_end}</Text>
              <View style={s.modalInfoRow}>
                <Text style={s.modalInfoLabel}>Total liquidación</Text>
                <Text style={s.modalInfoValue}>${Number(payModal.total_amount).toLocaleString()}</Text>
              </View>
              <View style={s.modalInfoRow}>
                <Text style={s.modalInfoLabel}>Ya pagado</Text>
                <Text style={s.modalInfoValue}>${payModal.totalPaid.toLocaleString()}</Text>
              </View>
              <View style={[s.modalInfoRow, { borderBottomWidth: 0 }]}>
                <Text style={[s.modalInfoLabel, { fontWeight: '700' }]}>Pendiente</Text>
                <Text style={[s.modalInfoValue, { color: '#1b5e20', fontWeight: '800' }]}>${(Number(payModal.total_amount) - payModal.totalPaid).toLocaleString()}</Text>
              </View>

              <Text style={s.modalLabel}>Monto ($)</Text>
              <TextInput
                style={s.modalInput}
                value={payAmount ? formatNumber(payAmount) : ''}
                onChangeText={(text) => setPayAmount(text.replace(/\./g, ''))}
                keyboardType="numeric"
                placeholder="0"
                selectTextOnFocus
              />

              <Text style={s.modalLabel}>Notas (opcional)</Text>
              <TextInput
                style={s.modalInput}
                value={payNotes}
                onChangeText={setPayNotes}
                placeholder="Transferencia, efectivo..."
                placeholderTextColor="#9ca3af"
              />

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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  hero: { margin: 16, padding: 24, backgroundColor: '#1b5e20', borderRadius: 24 },
  heroLabel: { fontSize: 13, color: '#a5d6a7' },
  heroValue: { fontSize: 44, fontWeight: '800', color: '#fff', marginVertical: 8 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#388e3c' },
  heroSubLabel: { fontSize: 11, color: '#a5d6a7' },
  heroSubValue: { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#111', paddingHorizontal: 20, marginBottom: 8 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  cardPeriod: { fontSize: 14, color: '#374151', fontWeight: '500' },
  cardWorker: { fontSize: 13, fontWeight: '700', color: '#1b5e20', marginBottom: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardAmount: { fontSize: 18, fontWeight: '700', color: '#1b5e20' },
  paidLabel: { fontSize: 12, color: '#6b7280' },
  owedRow: { marginTop: 4 },
  owedLabel: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  paymentsList: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  paymentsTitle: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  paymentDate: { fontSize: 13, color: '#374151' },
  paymentNotes: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  paymentAmount: { fontSize: 14, fontWeight: '600', color: '#1b5e20' },
  paymentsEmpty: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyText: { fontSize: 15, color: '#9ca3af', marginTop: 8 },
  payBtn: { backgroundColor: '#1b5e20', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 8 },
  payBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12 },
  modalWorker: { fontSize: 16, fontWeight: '600', color: '#1b5e20' },
  modalPeriod: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalInfoLabel: { fontSize: 14, color: '#6b7280' },
  modalInfoValue: { fontSize: 14, fontWeight: '600', color: '#111' },
  modalLabel: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginTop: 16, marginBottom: 4 },
  modalInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#111' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: '#6b7280', fontSize: 15, fontWeight: '500' },
  modalPayBtn: { flex: 2, backgroundColor: '#1b5e20', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalPayText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
