import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, FlatList, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { QRScanner } from '../../src/components/QRScanner';
import { localDate } from '../../src/utils/date';
import { formatMoney } from '../../src/utils/format';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { SuccessOverlay } from '../../src/components/SuccessOverlay';

type Step = 'scan' | 'select-block' | 'quantity';

export default function RegisterScreen() {
  const { worker: currentWorker } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('scan');
  const [qrInput, setQrInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<{ id: string; full_name: string } | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<{ id: string; name: string; product_id: string; product_name?: string } | null>(null);
  const [quantity, setQuantity] = useState('');
  const [successData, setSuccessData] = useState<{ title: string; subtitle: string } | null>(null);

  const { data: blocks } = useQuery({
    queryKey: ['my-blocks'],
    queryFn: async () => {
      const { data } = await supabase.from('blocks').select('id, name, product_id, products(name)').eq('status', 'active').order('name');
      return (data || []).map((b: any) => ({ id: b.id, name: b.name, product_id: b.product_id, product_name: b.products?.name }));
    },
  });

  async function handleScan() {
    if (!qrInput.trim()) { Alert.alert('Error', 'Ingrese el badge QR'); return; }
    await lookupWorker(qrInput.trim());
  }

  async function handleQRScanned(data: string) {
    setShowScanner(false);
    await lookupWorker(data.trim());
  }

  async function lookupWorker(badge: string) {
    const { data, error } = await supabase.from('workers').select('id, full_name, status, crew_id').eq('qr_badge_url', badge).single();
    if (error || !data) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', 'Badge QR no reconocido'); return; }
    if (data.status !== 'active') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Alert.alert('Error', `${data.full_name} no está activo`); return; }
    // El Encargado solo puede registrar producción de trabajadores de SU cuadrilla.
    if (currentWorker?.role === 'crew_lead') {
      const { data: myCrew } = await supabase.from('crews').select('id').eq('status', 'active').limit(1).maybeSingle();
      if (!myCrew || data.crew_id !== myCrew.id) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Fuera de tu cuadrilla', `${data.full_name} no pertenece a tu cuadrilla.`);
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWorker(data);
    if (selectedBlock) { setStep('quantity'); } else { setStep('select-block'); }
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity);
      if (!selectedWorker || !selectedBlock || qty <= 0) throw new Error('Datos incompletos');
      const { data: rate } = await supabase.from('rates').select('amount').eq('product_id', selectedBlock.product_id).eq('status', 'current').single();
      if (!rate) throw new Error('Sin tarifa vigente');
      const { error } = await supabase.from('picking_records').insert({
        worker_id: selectedWorker.id, block_id: selectedBlock.id, quantity: qty,
        rate_amount_snapshot: rate.amount, work_day: localDate(0), recorded_by: currentWorker?.id,
      });
      if (error) throw error;
      return { qty, total: qty * rate.amount, workerName: selectedWorker.full_name };
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['production'] });
      setSuccessData({
        title: `${data.qty} unidades registradas`,
        subtitle: `${data.workerName} → ${formatMoney(data.total)}`,
      });
    },
    onError: (err: any) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', err.message); },
  });

  function resetForSameBlock() { setStep('scan'); setQrInput(''); setShowScanner(false); setSelectedWorker(null); setQuantity(''); }
  function resetForm() { setStep('scan'); setQrInput(''); setShowScanner(false); setSelectedWorker(null); setSelectedBlock(null); setQuantity(''); }

  if (showScanner) return <QRScanner onScan={handleQRScanned} onClose={() => setShowScanner(false)} />;

  const successOverlay = (
    <SuccessOverlay
      visible={!!successData}
      title={successData?.title || ''}
      subtitle={successData?.subtitle}
      onFinish={() => { setSuccessData(null); resetForSameBlock(); }}
    />
  );

  if (step === 'scan') {
    return (
      <View style={s.container}>
        {successOverlay}
        {/* Step indicator */}
        <View style={s.stepBar}>
          <View style={[s.stepDot, s.stepActive]} /><View style={s.stepLine} /><View style={s.stepDot} /><View style={s.stepLine} /><View style={s.stepDot} />
        </View>

        {selectedBlock && (
          <View style={s.quickBanner}>
            <View style={{ flex: 1 }}>
              <Text style={s.quickLabel}>Paño seleccionado</Text>
              <Text style={s.quickValue}>📍 {selectedBlock.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedBlock(null)} style={s.quickChange}><Text style={s.quickChangeText}>Cambiar</Text></TouchableOpacity>
          </View>
        )}

        <View style={s.center}>
          <TouchableOpacity style={s.scanBtn} onPress={() => setShowScanner(true)} activeOpacity={0.85}>
            <Text style={{ fontSize: 40 }}>📷</Text>
            <Text style={s.scanBtnText}>Escanear Badge</Text>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} /><Text style={s.dividerText}>o manual</Text><View style={s.dividerLine} />
          </View>

          <TextInput style={s.input} placeholder="Código del badge" placeholderTextColor={colors.textMuted}
            value={qrInput} onChangeText={setQrInput} onSubmitEditing={handleScan} />
          <TouchableOpacity style={s.primaryBtn} onPress={handleScan} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Identificar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'select-block') {
    return (
      <View style={s.container}>
        {successOverlay}
        <View style={s.stepBar}>
          <View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepActive]} /><View style={s.stepLine} /><View style={s.stepDot} />
        </View>

        <View style={s.workerChip}>
          <Text style={s.workerChipText}>👷 {selectedWorker?.full_name}</Text>
        </View>

        <FlatList
          data={blocks || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.blockCard} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedBlock(item); setStep('quantity'); }} activeOpacity={0.7}>
              <View>
                <Text style={s.blockName}>{item.name}</Text>
                <Text style={s.blockProduct}>{item.product_name}</Text>
              </View>
              <Text style={s.blockArrow}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Sin paños disponibles</Text></View>}
        />
        <TouchableOpacity style={s.backBtn} onPress={resetForm}><Text style={s.backBtnText}>← Volver</Text></TouchableOpacity>
      </View>
    );
  }

  // QUANTITY
  return (
    <View style={s.container}>
        {successOverlay}
      <View style={s.stepBar}>
        <View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepActive]} />
      </View>

      <View style={s.workerChip}>
        <Text style={s.workerChipText}>👷 {selectedWorker?.full_name}  •  📍 {selectedBlock?.name}</Text>
      </View>

      <View style={s.center}>
        <TextInput style={s.bigInput} placeholder="0" placeholderTextColor={colors.primaryMuted}
          value={quantity} onChangeText={setQuantity} keyboardType="numeric" autoFocus selectTextOnFocus />
        <Text style={s.unitLabel}>cajas / kilos</Text>
      </View>

      <View style={s.bottomRow}>
        <TouchableOpacity style={s.backBtn2} onPress={() => setStep('select-block')}>
          <Text style={s.backBtnText}>← Paño</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.confirmBtn, (!quantity || parseFloat(quantity) <= 0) && { opacity: 0.4 }]}
          onPress={() => submitMutation.mutate()}
          disabled={!quantity || parseFloat(quantity) <= 0 || submitMutation.isPending} activeOpacity={0.85}>
          <Text style={s.confirmBtnText}>{submitMutation.isPending ? '...' : '✓ Confirmar'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stepBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg, gap: 0 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cardBorder },
  stepActive: { backgroundColor: colors.primary, width: 12, height: 12, borderRadius: 6 },
  stepDone: { backgroundColor: colors.primaryLight },
  stepLine: { width: 40, height: 2, backgroundColor: colors.cardBorder },
  stepLineDone: { backgroundColor: colors.primaryLight },
  quickBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.blueBg, borderRadius: radius.lg, borderWidth: 1, borderColor: '#bfdbfe' },
  quickLabel: { fontSize: 11, color: colors.blue, fontWeight: font.medium },
  quickValue: { fontSize: 14, fontWeight: font.semibold, color: '#1e40af', marginTop: 2 },
  quickChange: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quickChangeText: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  scanBtn: { width: 140, height: 140, backgroundColor: colors.primaryBg, borderRadius: 70, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primaryMuted, borderStyle: 'dashed', marginBottom: spacing.xl },
  scanBtnText: { fontSize: 12, color: colors.primary, fontWeight: font.semibold, marginTop: 6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: spacing.xl },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  dividerText: { paddingHorizontal: spacing.md, fontSize: 12, color: colors.textMuted },
  input: { width: '100%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16, textAlign: 'center', color: colors.text },
  primaryBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: spacing.md },
  primaryBtnText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
  workerChip: { alignSelf: 'center', backgroundColor: colors.primaryBg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, marginBottom: spacing.sm },
  workerChipText: { fontSize: 13, fontWeight: font.semibold, color: colors.primaryDark },
  blockCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder },
  blockName: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  blockProduct: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  blockArrow: { fontSize: 22, color: colors.textMuted },
  bigInput: { fontSize: 64, fontWeight: font.extrabold, color: colors.primary, textAlign: 'center', width: '100%', borderBottomWidth: 2, borderBottomColor: colors.primaryMuted, paddingBottom: spacing.sm },
  unitLabel: { fontSize: 14, color: colors.textMuted, marginTop: spacing.md },
  bottomRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: 28, gap: spacing.sm },
  backBtn: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.card },
  backBtn2: { flex: 1, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.card },
  backBtnText: { color: colors.textSecondary, fontSize: 14, fontWeight: font.medium },
  confirmBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  confirmBtnText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
