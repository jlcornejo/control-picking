import {
  useState,
  useCallback,
  useEffect } from 'react';
import { View,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PAYMENT_EVIDENCE } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { useFeatureFlag } from '../../src/hooks/useFeatureFlag';
import { PhotoCapture } from '../../src/components/PhotoCapture';
import * as Haptics from 'expo-haptics';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { PaymentsSkeleton } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/EmptyState';
import { PaymentToast } from '../../src/components/PaymentToast';
import { useConnectivity } from '../../src/hooks/useConnectivity';
import { enqueue } from '../../src/lib/offline-queue';
import { showAlert } from '../../src/lib/alert';
import { currentOrgId } from '../../src/lib/picking-evidence';
import { uploadPaymentEvidence, signedPaymentEvidenceUrl } from '../../src/lib/payment-evidence';
import { AppText, AppTextInput } from '../../src/components/AppText';

/**
 * Thumbnails de evidencia (fotos de respaldo) de los pagos de una liquidación.
 * Solo se monta cuando el flag está activo y la tarjeta está expandida: consulta
 * payment_photo_evidence por los ids de pago y resuelve una URL firmada por foto.
 */
function PaymentEvidenceThumbnails({ paymentIds, enabled }: { paymentIds: string[]; enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ['payment-evidence', paymentIds],
    enabled: enabled && paymentIds.length > 0,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('payment_photo_evidence')
        .select('payment_id, image_path')
        .in('payment_id', paymentIds);
      const resolved = await Promise.all(
        (rows || []).map(async (r) => ({
          payment_id: r.payment_id as string,
          url: await signedPaymentEvidenceUrl(r.image_path as string),
        })),
      );
      // Agrupa las URLs firmadas por payment_id (ignora las que no se resolvieron).
      const byPayment: Record<string, string[]> = {};
      for (const r of resolved) {
        if (!r.url) continue;
        (byPayment[r.payment_id] ||= []).push(r.url);
      }
      return byPayment;
    },
  });

  const byPayment = data || {};
  const urls = Object.values(byPayment).flat();
  if (urls.length === 0) return null;

  return (
    <View style={s.evidenceBlock}>
      <AppText style={s.evidenceTitle}>Fotos de respaldo</AppText>
      <View style={s.evidenceRow}>
        {urls.map((url) => (
          <Image key={url} source={{ uri: url }} style={s.evidenceThumb} />
        ))}
      </View>
    </View>
  );
}

export default function PaymentsScreen() {
  const { worker } = useAuth();
  const { online } = useConnectivity();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  // Fotos de respaldo del pago (opcional, bajo feature flag payment_photo_evidence).
  const { enabled: photoEnabled } = useFeatureFlag('payment_photo_evidence');

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
      let query = supabase.from('settlements').select('id, period_start, period_end, total_amount, status, payee_type, worker_id, crew_id').order('generated_at', { ascending: false }).limit(30);
      if (worker?.role === 'worker') {
        query = query.eq('worker_id', worker!.id);
      }
      const { data } = await query;

      // Nombre del beneficiario: trabajador (payee worker) o cuadrilla (payee crew).
      // Se resuelven por separado con joins manuales (el móvil no usa embeds).
      let workerMap: Record<string, string> = {};
      let crewMap: Record<string, string> = {};
      if (worker?.role !== 'worker') {
        const workerIds = [...new Set((data || []).map(s => s.worker_id).filter(Boolean))];
        if (workerIds.length > 0) {
          const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
          workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
        }
        const crewIds = [...new Set((data || []).map(s => s.crew_id).filter(Boolean))];
        if (crewIds.length > 0) {
          const { data: crews } = await supabase.from('crews').select('id, name').in('id', crewIds);
          crewMap = Object.fromEntries((crews || []).map(c => [c.id, c.name]));
        }
      }

      const results = [];
      for (const s of data || []) {
        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount, paid_at, notes')
          .eq('settlement_id', s.id)
          .order('paid_at', { ascending: false });
        const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
        const payeeName = s.payee_type === 'crew'
          ? (crewMap[s.crew_id] ? `${crewMap[s.crew_id]} (cuadrilla)` : 'Cuadrilla')
          : (workerMap[s.worker_id] || '');
        results.push({ ...s, payments: payments || [], totalPaid, worker_name: payeeName });
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
  // Fotos de respaldo (uris locales) y visor de cámara del modal de pago.
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);

  // Cierra el modal de pago y limpia TODO su estado (monto, notas y fotos).
  function closePayModal() {
    setPayModal(null);
    setPayAmount('');
    setPayNotes('');
    setPhotoUris([]);
    setShowPhoto(false);
  }

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payModal) throw new Error('Sin liquidación');
      const amount = parseFloat(payAmount);
      if (!amount || amount <= 0) throw new Error('Monto inválido');
      const remaining = Number(payModal.total_amount) - payModal.totalPaid;
      if (amount > remaining) throw new Error('Monto supera el saldo');

      // El sujeto de pago se deriva del tipo de liquidación: 'crew' -> pago al
      // Encargado (crew_id); 'worker' -> pago al trabajador (worker_id).
      // organization_id lo completa el trigger set_organization_id desde el JWT.
      const payeeColumns = payModal.payee_type === 'crew'
        ? { crew_id: payModal.crew_id as string | null, worker_id: null }
        : { worker_id: payModal.worker_id as string | null, crew_id: null };

      if (online) {
        const { data: inserted, error } = await supabase.from('payments').insert({
          settlement_id: payModal.id,
          ...payeeColumns,
          amount,
          notes: payNotes || null,
        }).select('id').single();
        if (error) throw error;

        // Update status (lógica pending/partial/paid INTACTA, no se toca).
        const newPaid = payModal.totalPaid + amount;
        const newStatus = newPaid >= Number(payModal.total_amount) ? 'paid' : 'partial';
        await supabase.from('settlements').update({ status: newStatus }).eq('id', payModal.id);

        // Fotos de respaldo (opcional, solo online y bajo el flag): se suben a
        // Storage best-effort y se inserta su fila en payment_photo_evidence. Si
        // alguna falla NO se revierte el pago (el pago es lo crítico); se avisa.
        let photoFailed = false;
        if (photoEnabled && photoUris.length > 0 && inserted?.id) {
          const orgId = await currentOrgId();
          if (orgId) {
            for (const uri of photoUris) {
              try {
                const path = await uploadPaymentEvidence({ orgId, paymentId: inserted.id, localUri: uri });
                const { error: evErr } = await supabase.from('payment_photo_evidence').insert({
                  payment_id: inserted.id,
                  image_path: path,
                  uploaded_by: worker!.id,
                });
                if (evErr) photoFailed = true;
              } catch {
                photoFailed = true; // best-effort: no romper el pago por la foto
              }
            }
          } else if (photoUris.length > 0) {
            photoFailed = true;
          }
        }
        return { queued: false, photoFailed, photoSkippedOffline: false };
      }

      // Offline: encolar el pago. Al reproducir se re-verifica el saldo real
      // desde el servidor (inmutabilidad del settlement pagado). La rama offline
      // NO sube fotos (requieren conexión); si había fotos adjuntas se informa.
      await enqueue({
        type: 'payment_insert',
        payload: {
          settlement_id: payModal.id,
          worker_id: payeeColumns.worker_id ?? null,
          crew_id: payeeColumns.crew_id ?? null,
          amount,
          notes: payNotes || null,
          settlement_total: Number(payModal.total_amount),
        },
      });
      return { queued: true, photoFailed: false, photoSkippedOffline: photoEnabled && photoUris.length > 0 };
    },
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closePayModal();
      queryClient.invalidateQueries({ queryKey: ['my-balance'] });
      queryClient.invalidateQueries({ queryKey: ['my-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['payment-evidence'] });
      showAlert(res.queued ? 'Pago en espera' : 'Pago registrado',
        res.queued ? 'Se sincronizará al reconectar.' : undefined);
      // Las fotos requieren conexión: la rama offline no las sube.
      if (res.photoSkippedOffline) {
        showAlert('Fotos no adjuntadas', 'El pago quedó en espera; las fotos de respaldo requieren conexión. Vuelve a adjuntarlas con señal si es necesario.');
      }
      // Una foto no se pudo subir, pero el pago sí se registró.
      if (res.photoFailed) {
        showAlert('Foto no adjuntada', 'El pago se registró; una foto no se pudo adjuntar.');
      }
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert('Error', err.message);
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
            <AppText style={s.heroLabel}>{worker?.role === 'worker' ? 'Saldo pendiente de cobro' : 'Total pendiente de pago'}</AppText>
            <AppText style={s.heroValue}>${Math.round(balance?.pending || 0).toLocaleString()}</AppText>
            <View style={s.heroFooter}>
              <View>
                <AppText style={s.heroSubLabel}>Liquidado</AppText>
                <AppText style={s.heroSubValue}>${Math.round(balance?.owed || 0).toLocaleString()}</AppText>
              </View>
              <View>
                <AppText style={s.heroSubLabel}>Pagado</AppText>
                <AppText style={s.heroSubValue}>${Math.round(balance?.paid || 0).toLocaleString()}</AppText>
              </View>
            </View>
          </View>
          <AppText style={s.sectionTitle}>{worker?.role === 'worker' ? 'Mis Liquidaciones' : 'Todas las Liquidaciones'}</AppText>
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
                {item.worker_name ? <AppText style={s.cardWorker}>{item.worker_name}</AppText> : null}
                <AppText style={s.cardPeriod}>{item.period_start} — {item.period_end}</AppText>
              </View>
              <AppText style={s.cardAmount}>${Math.round(Number(item.total_amount)).toLocaleString()}</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
              <View style={[s.statusBadge, { backgroundColor: statusColor[item.status] + '20' }]}>
                <AppText style={[s.statusText, { color: statusColor[item.status] }]}>{statusLabel[item.status]}</AppText>
              </View>
              {item.totalPaid > 0 && (
                <AppText style={s.paidLabel}>Pagado: {formatMoney(item.totalPaid)}</AppText>
              )}
            </View>
            {item.status !== 'paid' && (
              <View style={s.owedRow}>
                <AppText style={s.owedLabel}>Adeudado: {formatMoney(Number(item.total_amount) - item.totalPaid)}</AppText>
              </View>
            )}

            {/* Pay button for admin */}
            {worker?.role !== 'worker' && item.status !== 'paid' && (
              <TouchableOpacity style={s.payBtn} onPress={() => { setPayModal(item); setPayAmount(String(Number(item.total_amount) - item.totalPaid)); setPayNotes(''); setPhotoUris([]); setShowPhoto(false); }} activeOpacity={0.7}>
                <AppText style={s.payBtnText}>Pagar</AppText>
              </TouchableOpacity>
            )}

            {/* Expanded payment details */}
            {expandedId === item.id && item.payments.length > 0 && (
              <View style={s.paymentsList}>
                <AppText style={s.paymentsTitle}>Detalle de pagos</AppText>
                {item.payments.map((p: any) => (
                  <View key={p.id} style={s.paymentRow}>
                    <View>
                      <AppText style={s.paymentDate}>{new Date(p.paid_at).toLocaleDateString('es-CL')}</AppText>
                      {p.notes && <AppText style={s.paymentNotes}>{p.notes}</AppText>}
                    </View>
                    <AppText style={s.paymentAmount}>${Number(p.amount).toLocaleString()}</AppText>
                  </View>
                ))}
              </View>
            )}
            {expandedId === item.id && item.payments.length === 0 && (
              <View style={s.paymentsList}>
                <AppText style={s.paymentsEmpty}>Sin pagos registrados</AppText>
              </View>
            )}

            {/* Fotos de respaldo de los pagos (solo bajo el flag, al expandir). */}
            {photoEnabled && expandedId === item.id && item.payments.length > 0 && (
              <PaymentEvidenceThumbnails
                paymentIds={item.payments.map((p: any) => p.id)}
                enabled={photoEnabled && expandedId === item.id}
              />
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
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closePayModal} />
        <View style={s.modalContent}>
          <AppText style={s.modalTitle}>Registrar Pago</AppText>
          {payModal && (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <AppText style={s.modalWorker}>{payModal.worker_name || 'Trabajador'}</AppText>
              <AppText style={s.modalPeriod}>{payModal.period_start} — {payModal.period_end}</AppText>
              <View style={s.modalInfoRow}>
                <AppText style={s.modalInfoLabel}>Total liquidación</AppText>
                <AppText style={s.modalInfoValue}>${Number(payModal.total_amount).toLocaleString()}</AppText>
              </View>
              <View style={s.modalInfoRow}>
                <AppText style={s.modalInfoLabel}>Ya pagado</AppText>
                <AppText style={s.modalInfoValue}>${payModal.totalPaid.toLocaleString()}</AppText>
              </View>
              <View style={[s.modalInfoRow, { borderBottomWidth: 0 }]}>
                <AppText style={[s.modalInfoLabel, { fontWeight: '700' }]}>Pendiente</AppText>
                <AppText style={[s.modalInfoValue, { color: '#1b5e20', fontWeight: '800' }]}>${(Number(payModal.total_amount) - payModal.totalPaid).toLocaleString()}</AppText>
              </View>

              <AppText style={s.modalLabel}>Monto ($)</AppText>
              <AppTextInput
                style={s.modalInput}
                value={payAmount ? formatNumber(payAmount) : ''}
                onChangeText={(text) => setPayAmount(text.replace(/\./g, ''))}
                keyboardType="numeric"
                placeholder="0"
                selectTextOnFocus
              />

              <AppText style={s.modalLabel}>Notas (opcional)</AppText>
              <AppTextInput
                style={s.modalInput}
                value={payNotes}
                onChangeText={setPayNotes}
                placeholder="Transferencia, efectivo..."
                placeholderTextColor="#9ca3af"
              />

              {/* Fotos de respaldo (opcional, bajo feature flag payment_photo_evidence). */}
              {photoEnabled && (
                <View style={s.photoBox}>
                  <AppText style={s.modalLabel}>Fotos de respaldo (opcional, máx {PAYMENT_EVIDENCE.MAX_IMAGES})</AppText>
                  {photoUris.length > 0 && (
                    <View style={s.photoThumbs}>
                      {photoUris.map((uri, i) => (
                        <View key={uri} style={s.photoThumbWrap}>
                          <Image source={{ uri }} style={s.photoThumb} />
                          <TouchableOpacity
                            style={s.photoRemove}
                            onPress={() => setPhotoUris((p) => p.filter((_, idx) => idx !== i))}
                            activeOpacity={0.8}
                          >
                            <AppText style={s.photoRemoveText}>Quitar</AppText>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    style={[s.photoAddBtn, photoUris.length >= PAYMENT_EVIDENCE.MAX_IMAGES && { opacity: 0.4 }]}
                    onPress={() => setShowPhoto(true)}
                    disabled={photoUris.length >= PAYMENT_EVIDENCE.MAX_IMAGES}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="camera-outline" size={18} color="#6b7280" />
                    <AppText style={s.photoAddText}>Agregar foto</AppText>
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.modalButtons}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={closePayModal}>
                  <AppText style={s.modalCancelText}>Cancelar</AppText>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modalPayBtn, s.payBtnRow]} onPress={() => payMutation.mutate()} disabled={payMutation.isPending} activeOpacity={0.8}>
                  {payMutation.isPending ? (
                    <AppText style={s.modalPayText}>...</AppText>
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <AppText style={s.modalPayText}>Pagar</AppText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Visor de cámara para la foto de respaldo. Se monta sobre el modal de pago
        (full-screen) y devuelve el uri local; el límite de 3 se aplica aquí. */}
    <Modal visible={showPhoto} animationType="slide">
      <PhotoCapture
        onCapture={(uri) => {
          setPhotoUris((p) => [...p, uri].slice(0, PAYMENT_EVIDENCE.MAX_IMAGES));
          setShowPhoto(false);
        }}
        onClose={() => setShowPhoto(false)}
      />
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
  cardPeriod: { fontSize: 14, color: '#374151', fontWeight: '500', includeFontPadding: false },
  cardWorker: { fontSize: 13, fontWeight: '700', color: '#1b5e20', marginBottom: 2, includeFontPadding: false },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '600', includeFontPadding: false },
  cardAmount: { fontSize: 18, fontWeight: '700', color: '#1b5e20', includeFontPadding: false },
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
  payBtnRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  modalPayText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Fotos de respaldo en el modal de pago
  photoBox: { marginTop: 4 },
  photoThumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  photoThumbWrap: { alignItems: 'center' },
  photoThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#f1f5f9' },
  photoRemove: { marginTop: 4, paddingVertical: 2, paddingHorizontal: 6 },
  photoRemoveText: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  photoAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12 },
  photoAddText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  // Thumbnails de evidencia en el detalle expandido del pago
  evidenceBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  evidenceTitle: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidenceThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#f1f5f9' },
});
