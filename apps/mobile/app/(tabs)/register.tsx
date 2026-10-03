import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, FlatList, StyleSheet, Image } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluateBoxTolerance, ToleranceUnit } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { useFeatureFlag } from '../../src/hooks/useFeatureFlag';
import { QRScanner } from '../../src/components/QRScanner';
import { PhotoCapture } from '../../src/components/PhotoCapture';
import { tenantWorkday } from '../../src/utils/date';
import { formatMoney } from '../../src/utils/format';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { SuccessOverlay } from '../../src/components/SuccessOverlay';
import { useConnectivity } from '../../src/hooks/useConnectivity';
import { enqueue } from '../../src/lib/offline-queue';
import { newUuid, uploadPickingEvidence, currentOrgId } from '../../src/lib/picking-evidence';

/** Tipo de caja/envase con destare y tolerancia (control de merma). */
type BoxTypeOption = {
  id: string;
  name: string;
  tare_weight_kg: number;
  target_net_weight_kg: number;
  tolerance_over: number;
  tolerance_under: number;
  tolerance_unit: ToleranceUnit;
};

type Step = 'scan' | 'select-block' | 'select-row' | 'quantity';

type SelectedRow = { id: string; name: string; row_number: number | null } | null;

export default function RegisterScreen() {
  const { worker: currentWorker } = useAuth();
  const { online } = useConnectivity();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('scan');
  const [qrInput, setQrInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<{ id: string; full_name: string; day_roster_id: string | null } | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<{ id: string; name: string; product_id: string; product_name?: string; unit_measure?: 'box' | 'kg' } | null>(null);
  const [selectedRow, setSelectedRow] = useState<SelectedRow>(null);
  const [rowChoices, setRowChoices] = useState<{ id: string; name: string; row_number: number | null }[]>([]);
  const [quantity, setQuantity] = useState('');
  const [successData, setSuccessData] = useState<{ title: string; subtitle: string } | null>(null);
  // Destare (control de merma): tipo de caja + peso bruto pesado. Solo cuando el
  // flag box_tare_control está activo y el producto del paño se mide por caja.
  const [selectedBoxType, setSelectedBoxType] = useState<BoxTypeOption | null>(null);
  const [grossWeight, setGrossWeight] = useState('');
  // Foto de respaldo (evidencia): uri local de la foto tomada y visor de cámara.
  // Solo cuando el flag picking_photo_evidence está activo.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  const { enabled: tareEnabled } = useFeatureFlag('box_tare_control');
  const { enabled: photoEnabled } = useFeatureFlag('picking_photo_evidence');

  const { data: blocks } = useQuery({
    queryKey: ['my-blocks'],
    queryFn: async () => {
      const { data } = await supabase.from('blocks').select('id, name, product_id, products(name, unit_measure)').eq('status', 'active').order('name');
      return (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        product_id: b.product_id,
        product_name: b.products?.name,
        unit_measure: b.products?.unit_measure as 'box' | 'kg' | undefined,
      }));
    },
  });

  // Tipos de caja activos del tenant (solo se usan si el flag está activo).
  const { data: boxTypes } = useQuery({
    queryKey: ['box-types'],
    enabled: tareEnabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('box_types')
        .select('id, name, tare_weight_kg, target_net_weight_kg, tolerance_over, tolerance_under, tolerance_unit')
        .eq('status', 'active')
        .order('name');
      return (data || []) as BoxTypeOption[];
    },
  });

  // Tarifas vigentes por producto, cacheadas para poder registrar sin conexión
  // (el rate_amount_snapshot debe existir al momento del registro).
  const { data: ratesByProduct } = useQuery({
    queryKey: ['current-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('rates').select('product_id, amount').eq('status', 'current');
      return Object.fromEntries((data || []).map((r: any) => [r.product_id, Number(r.amount)])) as Record<string, number>;
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
    const { data, error } = await supabase.from('workers').select('id, full_name, status').eq('qr_badge_url', badge).single();
    if (error || !data) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', 'Badge QR no reconocido'); return; }
    if (data.status !== 'active') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Alert.alert('Error', `${data.full_name} no está activo`); return; }

    // El responsable (Encargado o Supervisor) solo registra producción de los
    // trabajadores que están en SU equipo del día. La atribución se congela con
    // el day_roster_id de la jornada. El worker "puro" (raro aquí) no aplica.
    let dayRosterId: string | null = null;
    if (currentWorker?.role === 'crew_lead' || currentWorker?.role === 'supervisor') {
      const { data: roster } = await supabase
        .from('day_roster')
        .select('id')
        .eq('lead_id', currentWorker.id)
        .eq('worker_id', data.id)
        .eq('work_day', await tenantWorkday(0))
        .maybeSingle();
      if (!roster) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Fuera de tu equipo de hoy', `${data.full_name} no está en tu equipo de hoy. Agrégalo desde "Mi equipo" antes de registrar su producción.`);
        return;
      }
      dayRosterId = roster.id;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedWorker({ id: data.id, full_name: data.full_name, day_roster_id: dayRosterId });
    // Si ya hay paño seleccionado, respetamos si tiene melgas (rowChoices) o no.
    if (selectedBlock) {
      setStep(rowChoices.length > 0 && !selectedRow ? 'select-row' : 'quantity');
    } else {
      setStep('select-block');
    }
  }

  // Selecciona un paño y decide el siguiente paso: si el paño tiene melgas
  // activas, ofrece elegir melga; si no tiene, salta directo a la cantidad.
  // Así el nivel melga aparece solo cuando el cliente/campo realmente lo usa.
  async function chooseBlock(block: { id: string; name: string; product_id: string; product_name?: string; unit_measure?: 'box' | 'kg' }) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBlock(block);
    setSelectedRow(null);
    const { data } = await supabase
      .from('field_rows')
      .select('id, name, row_number')
      .eq('block_id', block.id)
      .eq('status', 'active')
      .order('row_number', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    const rows = (data || []).map((r: any) => ({ id: r.id, name: r.name, row_number: r.row_number ?? null }));
    setRowChoices(rows);
    setStep(rows.length > 0 ? 'select-row' : 'quantity');
  }

  // ¿Aplica el control de destare en este registro? Solo si el flag está activo,
  // el producto del paño se mide por caja y hay tipos de caja configurados.
  const tareApplies = tareEnabled && selectedBlock?.unit_measure === 'box' && (boxTypes?.length ?? 0) > 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(quantity);
      if (!selectedWorker || !selectedBlock || qty <= 0) throw new Error('Datos incompletos');

      // Destare (opcional): si aplica y el supervisor eligió caja + pesó, se
      // calcula el neto y se marca fuera de tolerancia. El pago NO cambia (por qty).
      let boxFields: {
        box_type_id: string | null;
        gross_weight_kg: number | null;
        tare_snapshot_kg: number | null;
        net_weight_kg: number | null;
        out_of_tolerance: boolean;
      } = { box_type_id: null, gross_weight_kg: null, tare_snapshot_kg: null, net_weight_kg: null, out_of_tolerance: false };

      if (tareApplies && selectedBoxType) {
        const gross = parseFloat(grossWeight);
        if (!Number.isFinite(gross) || gross <= 0) throw new Error('Ingresa el peso bruto de la caja');
        const evalResult = evaluateBoxTolerance(gross, selectedBoxType.tare_weight_kg, selectedBoxType);
        boxFields = {
          box_type_id: selectedBoxType.id,
          gross_weight_kg: gross,
          tare_snapshot_kg: selectedBoxType.tare_weight_kg,
          net_weight_kg: evalResult.net_weight_kg,
          out_of_tolerance: evalResult.out_of_tolerance,
        };
      }

      // Resolver la tarifa vigente: online consulta directa; offline usa la
      // caché de tarifas. En ambos casos debe ser > 0 (rate_amount_snapshot).
      let rateAmount: number | undefined;
      if (online) {
        const { data: rate } = await supabase.from('rates').select('amount').eq('product_id', selectedBlock.product_id).eq('status', 'current').single();
        rateAmount = rate ? Number(rate.amount) : ratesByProduct?.[selectedBlock.product_id];
      } else {
        rateAmount = ratesByProduct?.[selectedBlock.product_id];
      }
      if (!rateAmount || rateAmount <= 0) throw new Error('Sin tarifa vigente para este producto');

      // Id del registro generado en cliente: permite correlacionar la foto de
      // respaldo (ruta {org}/{recordId}/{uuid}.jpg) con el registro antes de
      // insertarlo. La tabla acepta id explícito (default gen_random_uuid()).
      const recordId = newUuid();

      // Foto de respaldo (opcional, solo online): se sube primero a Storage y, si
      // tiene éxito, se guarda su ruta en el registro. Si la subida falla, NO se
      // bloquea el registro: se guarda sin foto y se avisa (la cosecha es lo
      // crítico). Offline no sube foto (requiere conexión); se informa.
      let backupImagePath: string | null = null;
      let photoSkippedOffline = false;
      if (photoEnabled && photoUri) {
        if (online) {
          const orgId = await currentOrgId();
          if (orgId) {
            try {
              backupImagePath = await uploadPickingEvidence({ orgId, recordId, localUri: photoUri });
            } catch {
              backupImagePath = null; // best-effort: no romper el registro por la foto
            }
          }
        } else {
          photoSkippedOffline = true;
        }
      }

      // work_day en la zona del tenant (autoridad del servidor vía RPC).
      // Se fija explícitamente para que el flujo offline conserve la fecha
      // correcta aunque se sincronice más tarde; online, el trigger de respaldo
      // igual lo resolvería en la zona del tenant.
      const record = {
        worker_id: selectedWorker.id,
        block_id: selectedBlock.id,
        row_id: selectedRow?.id ?? null,
        quantity: qty,
        rate_amount_snapshot: rateAmount,
        work_day: await tenantWorkday(0),
        recorded_by: currentWorker?.id ?? null,
        // Congela la atribución del día: bajo qué responsable/equipo se cosechó.
        day_roster_id: selectedWorker.day_roster_id,
        // Snapshot de destare (null cuando no aplica el control de peso).
        ...boxFields,
      };

      if (online) {
        // Incluye el id de cliente y la ruta de la foto (si se subió).
        const { error } = await supabase.from('picking_records').insert({ ...record, id: recordId, backup_image_path: backupImagePath });
        if (error) throw error;
        return { qty, total: qty * rateAmount, workerName: selectedWorker.full_name, queued: false, outOfTolerance: boxFields.out_of_tolerance, netWeight: boxFields.net_weight_kg, photoSkippedOffline, hasPhoto: !!backupImagePath };
      }

      // Offline: encolar para sincronizar al reconectar.
      await enqueue({ type: 'picking_insert', payload: record });
      return { qty, total: qty * rateAmount, workerName: selectedWorker.full_name, queued: true, outOfTolerance: boxFields.out_of_tolerance, netWeight: boxFields.net_weight_kg, photoSkippedOffline, hasPhoto: false };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['production'] });

      // Alerta de merma NO bloqueante: el registro ya se guardó (y quedó auditado
      // con out_of_tolerance). Solo se informa; el supervisor decide qué hacer.
      if (data.outOfTolerance && selectedBoxType) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          '⚠️ Peso fuera de tolerancia',
          `Neto ${data.netWeight} kg vs objetivo ${selectedBoxType.target_net_weight_kg} kg (${selectedBoxType.name}). ` +
            'El registro se guardó y quedó marcado para revisión. Ajusta la caja para evitar merma.',
          [{ text: 'Entendido' }],
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Aviso si la foto de respaldo no se pudo adjuntar por estar sin conexión.
      if (data.photoSkippedOffline) {
        Alert.alert('Foto no adjuntada', 'El registro se guardó, pero la foto de respaldo requiere conexión. Vuelve a adjuntarla con señal si es necesario.');
      }

      setSuccessData({
        title: data.queued ? `${data.qty} unidades en espera` : `${data.qty} unidades registradas`,
        subtitle: data.queued
          ? `${data.workerName} → se sincronizará al reconectar`
          : `${data.workerName} → ${formatMoney(data.total)}${data.hasPhoto ? '  📷' : ''}`,
      });
    },
    onError: (err: any) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); Alert.alert('Error', err.message); },
  });

  function resetForSameBlock() { setStep('scan'); setQrInput(''); setShowScanner(false); setSelectedWorker(null); setSelectedRow(null); setQuantity(''); setSelectedBoxType(null); setGrossWeight(''); setPhotoUri(null); setShowPhoto(false); }
  function resetForm() { setStep('scan'); setQrInput(''); setShowScanner(false); setSelectedWorker(null); setSelectedBlock(null); setSelectedRow(null); setRowChoices([]); setQuantity(''); setSelectedBoxType(null); setGrossWeight(''); setPhotoUri(null); setShowPhoto(false); }

  if (showScanner) return <QRScanner onScan={handleQRScanned} onClose={() => setShowScanner(false)} />;
  if (showPhoto) return <PhotoCapture onCapture={(uri) => { setPhotoUri(uri); setShowPhoto(false); }} onClose={() => setShowPhoto(false)} />;

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
            <TouchableOpacity style={s.blockCard} onPress={() => chooseBlock(item)} activeOpacity={0.7}>
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

  if (step === 'select-row') {
    return (
      <View style={s.container}>
        {successOverlay}
        <View style={s.stepBar}>
          <View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepActive]} />
        </View>

        <View style={s.workerChip}>
          <Text style={s.workerChipText}>👷 {selectedWorker?.full_name}  •  📍 {selectedBlock?.name}</Text>
        </View>

        <Text style={s.rowHint}>Seleccione la melga</Text>

        <FlatList
          data={rowChoices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.blockCard}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedRow(item); setStep('quantity'); }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {item.row_number != null && (
                  <View style={s.rowNumberBadge}><Text style={s.rowNumberText}>{item.row_number}</Text></View>
                )}
                <Text style={s.blockName}>{item.name}</Text>
              </View>
              <Text style={s.blockArrow}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Sin melgas disponibles</Text></View>}
        />
        <TouchableOpacity style={s.backBtn} onPress={() => setStep('select-block')}><Text style={s.backBtnText}>← Paño</Text></TouchableOpacity>
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
        <Text style={s.workerChipText}>
          👷 {selectedWorker?.full_name}  •  📍 {selectedBlock?.name}{selectedRow ? `  •  🌱 ${selectedRow.name}` : ''}
        </Text>
      </View>

      <View style={s.center}>
        <TextInput style={s.bigInput} placeholder="0" placeholderTextColor={colors.primaryMuted}
          value={quantity} onChangeText={setQuantity} keyboardType="numeric" autoFocus selectTextOnFocus />
        <Text style={s.unitLabel}>cajas / kilos</Text>

        {tareApplies && (
          <View style={s.tareBox}>
            <Text style={s.tareLabel}>Tipo de caja</Text>
            <View style={s.tareChips}>
              {(boxTypes || []).map((bt) => {
                const active = selectedBoxType?.id === bt.id;
                return (
                  <TouchableOpacity
                    key={bt.id}
                    onPress={() => { Haptics.selectionAsync(); setSelectedBoxType(bt); }}
                    style={[s.tareChip, active && s.tareChipActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.tareChipText, active && s.tareChipTextActive]}>{bt.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedBoxType && (
              <>
                <TextInput
                  style={s.tareInput}
                  placeholder={`Peso bruto (objetivo ${selectedBoxType.target_net_weight_kg} kg + tara ${selectedBoxType.tare_weight_kg} kg)`}
                  placeholderTextColor={colors.textMuted}
                  value={grossWeight}
                  onChangeText={setGrossWeight}
                  keyboardType="numeric"
                />
                {!!grossWeight && parseFloat(grossWeight) > 0 && (() => {
                  const ev = evaluateBoxTolerance(parseFloat(grossWeight), selectedBoxType.tare_weight_kg, selectedBoxType);
                  return (
                    <Text style={[s.tareNet, ev.out_of_tolerance && s.tareNetWarn]}>
                      Neto {ev.net_weight_kg} kg {ev.out_of_tolerance ? '⚠️ fuera de tolerancia' : '✓ dentro de rango'}
                    </Text>
                  );
                })()}
              </>
            )}
          </View>
        )}

        {/* Foto de respaldo (opcional, bajo feature flag picking_photo_evidence) */}
        {photoEnabled && (
          <View style={s.photoBox}>
            {photoUri ? (
              <View style={s.photoRow}>
                <Image source={{ uri: photoUri }} style={s.photoThumb} />
                <View style={{ flex: 1 }}>
                  <Text style={s.photoLabel}>Foto de respaldo adjunta</Text>
                  <View style={s.photoActions}>
                    <TouchableOpacity onPress={() => setShowPhoto(true)}><Text style={s.photoAction}>Reemplazar</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setPhotoUri(null)}><Text style={[s.photoAction, s.photoActionRemove]}>Quitar</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.photoBtn} onPress={() => setShowPhoto(true)} activeOpacity={0.85}>
                <Text style={s.photoBtnIcon}>📷</Text>
                <Text style={s.photoBtnText}>Agregar foto de respaldo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={s.bottomRow}>
        <TouchableOpacity style={s.backBtn2} onPress={() => setStep(rowChoices.length > 0 ? 'select-row' : 'select-block')}>
          <Text style={s.backBtnText}>{rowChoices.length > 0 ? '← Melga' : '← Paño'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.confirmBtn, (!quantity || parseFloat(quantity) <= 0 || (tareApplies && selectedBoxType && !(parseFloat(grossWeight) > 0))) && { opacity: 0.4 }]}
          onPress={() => submitMutation.mutate()}
          disabled={!quantity || parseFloat(quantity) <= 0 || (tareApplies && !!selectedBoxType && !(parseFloat(grossWeight) > 0)) || submitMutation.isPending} activeOpacity={0.85}>
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
  rowHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  rowNumberBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rowNumberText: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
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
  // Control de destare (opcional, bajo feature flag)
  tareBox: { width: '100%', marginTop: spacing.xl, padding: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder },
  tareLabel: { fontSize: 12, fontWeight: font.semibold, color: colors.textMuted, marginBottom: spacing.sm, letterSpacing: 0.3 },
  tareChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tareChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.background },
  tareChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tareChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: font.medium },
  tareChipTextActive: { color: colors.textWhite },
  tareInput: { marginTop: spacing.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: colors.text },
  tareNet: { marginTop: spacing.sm, fontSize: 13, fontWeight: font.semibold, color: colors.primary },
  tareNetWarn: { color: colors.red },
  // Foto de respaldo
  photoBox: { width: '100%', marginTop: spacing.lg },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: 14, backgroundColor: colors.card },
  photoBtnIcon: { fontSize: 18 },
  photoBtnText: { fontSize: 14, fontWeight: font.semibold, color: colors.textSecondary },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder },
  photoThumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surface },
  photoLabel: { fontSize: 13, fontWeight: font.semibold, color: colors.text },
  photoActions: { flexDirection: 'row', gap: spacing.lg, marginTop: 6 },
  photoAction: { fontSize: 13, fontWeight: font.medium, color: colors.primary },
  photoActionRemove: { color: colors.red },
});
