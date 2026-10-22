import {
  useState } from 'react';
import { View,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Image,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { showAlert } from '../../src/lib/alert';
import { AppText, AppTextInput } from '../../src/components/AppText';
import { useBluetoothScale } from '../../src/hooks/useBluetoothScale';
import { round3 } from '../../src/lib/scale/round3';

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
  const [selectedBlock, setSelectedBlock] = useState<{ id: string; name: string; product_id: string; variety_id?: string | null; product_name?: string; unit_measure?: 'box' | 'kg' } | null>(null);
  const [selectedRow, setSelectedRow] = useState<SelectedRow>(null);
  const [rowChoices, setRowChoices] = useState<{ id: string; name: string; row_number: number | null }[]>([]);
  const [quantity, setQuantity] = useState('');
  const [successData, setSuccessData] = useState<{ title: string; subtitle: string } | null>(null);
  // Destare (control de merma): tipo de caja + peso bruto pesado. Solo cuando el
  // flag box_tare_control está activo y el producto del paño se mide por caja.
  const [selectedBoxType, setSelectedBoxType] = useState<BoxTypeOption | null>(null);
  const [grossWeight, setGrossWeight] = useState('');
  // Pago por kilo sin destare: kilos capturados manualmente (manual_kg).
  const [manualKg, setManualKg] = useState('');
  // Foto de respaldo (evidencia): uri local de la foto tomada y visor de cámara.
  // Solo cuando el flag picking_photo_evidence está activo.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  // Panel de depuración del stream crudo de la balanza (solo Android + flag).
  const [showScaleDebug, setShowScaleDebug] = useState(false);

  const { enabled: tareEnabled } = useFeatureFlag('box_tare_control');
  const { enabled: photoEnabled } = useFeatureFlag('picking_photo_evidence');
  // Pago por kilo: si el flag está off, no se ofrecen productos kg (CA-21).
  const { enabled: kgEnabled } = useFeatureFlag('kg_payment');
  // Lectura de balanza Bluetooth: solo Android y detrás del flag bluetooth_scale.
  const { enabled: scaleEnabled } = useFeatureFlag('bluetooth_scale');

  const { data: blocks } = useQuery({
    queryKey: ['my-blocks', kgEnabled],
    queryFn: async () => {
      const { data } = await supabase.from('blocks').select('id, name, product_id, variety_id, products!fk_blocks_product_org(name, unit_measure)').eq('status', 'active').order('name');
      return (data || [])
        .map((b: any) => ({
          id: b.id,
          name: b.name,
          product_id: b.product_id,
          variety_id: (b.variety_id ?? null) as string | null,
          product_name: b.products?.name,
          unit_measure: b.products?.unit_measure as 'box' | 'kg' | undefined,
        }))
        // Con kg_payment off, los paños de productos kg no se ofrecen al anotador.
        .filter((b: any) => kgEnabled || b.unit_measure !== 'kg');
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
    if (!qrInput.trim()) { showAlert('Error', 'Ingrese el badge QR'); return; }
    await lookupWorker(qrInput.trim());
  }

  async function handleQRScanned(data: string) {
    setShowScanner(false);
    await lookupWorker(data.trim());
  }

  async function lookupWorker(badge: string) {
    const { data, error } = await supabase.from('workers').select('id, full_name, status').eq('qr_badge_url', badge).single();
    if (error || !data) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); showAlert('Error', 'Badge QR no reconocido'); return; }
    if (data.status !== 'active') { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); showAlert('Error', `${data.full_name} no está activo`); return; }

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
        showAlert('Fuera de tu equipo de hoy', `${data.full_name} no está en tu equipo de hoy. Agrégalo desde "Mi equipo" antes de registrar su producción.`);
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
  async function chooseBlock(block: { id: string; name: string; product_id: string; variety_id?: string | null; product_name?: string; unit_measure?: 'box' | 'kg' }) {
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

  const isKgBlock = selectedBlock?.unit_measure === 'kg';

  // ¿Aplica el control de destare (caja) en este registro? Solo si el flag está
  // activo, el producto del paño se mide por caja y hay tipos de caja configurados.
  const tareApplies = tareEnabled && selectedBlock?.unit_measure === 'box' && (boxTypes?.length ?? 0) > 0;

  // Pago por kilo con destare: el paño es kg, el flag box_tare_control está on y
  // hay tipos de caja. Se pesa la caja y el servidor deriva el neto (paid_kg).
  const kgTareApplies = isKgBlock && tareEnabled && (boxTypes?.length ?? 0) > 0;

  // Pago por kilo manual: el paño es kg y NO hay destare -> se capturan los kilos.
  const kgManualApplies = isKgBlock && !kgTareApplies;

  // ¿Aplica la lectura de balanza Bluetooth? Mismo criterio que el input manual
  // de kilos (kgManualApplies) + flag activo + SOLO Android. En iOS o con el flag
  // apagado scaleApplies es false y la pantalla queda EXACTAMENTE como hoy.
  const scaleApplies = scaleEnabled && Platform.OS === 'android' && kgManualApplies;
  // El hook no puede llamarse condicionalmente: siempre se monta pero queda
  // inerte (nunca toca el módulo nativo) cuando enabled es false o no es Android.
  const scale = useBluetoothScale({ enabled: scaleApplies });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorker || !selectedBlock) throw new Error('Datos incompletos');

      const paymentUnit: 'box' | 'kg' = isKgBlock ? 'kg' : 'box';
      // round3 compartido (apps/mobile/src/lib/scale/round3.ts): misma fórmula
      // que usa el autocompletado de la balanza, para evitar divergencias.

      // Destare (opcional): si aplica y el supervisor eligió caja + pesó, se
      // calcula el neto y se marca fuera de tolerancia. En productos por caja el
      // pago sigue siendo por qty; en productos por kg el neto ES la base pagada.
      let boxFields: {
        box_type_id: string | null;
        gross_weight_kg: number | null;
        tare_snapshot_kg: number | null;
        net_weight_kg: number | null;
        out_of_tolerance: boolean;
      } = { box_type_id: null, gross_weight_kg: null, tare_snapshot_kg: null, net_weight_kg: null, out_of_tolerance: false };

      // Cantidad (quantity) y base pagable en kg (paid_quantity_kg) según unidad.
      let qty: number;
      let paidQuantityKg: number | null = null;

      if (isKgBlock) {
        if (kgTareApplies) {
          // kg con destare: se pesa la caja; paid_kg = neto = max(bruto - tara, 0).
          if (!selectedBoxType) throw new Error('Selecciona el tipo de caja');
          const gross = parseFloat(grossWeight);
          if (!Number.isFinite(gross) || gross <= 0) throw new Error('Ingresa el peso bruto de la caja');
          const ev = evaluateBoxTolerance(gross, selectedBoxType.tare_weight_kg, selectedBoxType);
          const net = round3(Math.max(ev.net_weight_kg, 0));
          if (net <= 0) throw new Error('El peso neto debe ser mayor a 0');
          boxFields = {
            box_type_id: selectedBoxType.id,
            gross_weight_kg: gross,
            tare_snapshot_kg: selectedBoxType.tare_weight_kg,
            net_weight_kg: ev.net_weight_kg,
            out_of_tolerance: ev.out_of_tolerance,
          };
          paidQuantityKg = net;
          qty = 1; // una caja pesada
        } else {
          // kg manual: paid_kg = round3(manual_kg); quantity = 1.
          const kg = parseFloat(manualKg);
          if (!Number.isFinite(kg) || kg <= 0) throw new Error('Ingresa los kilos recolectados');
          paidQuantityKg = round3(kg);
          qty = 1;
        }
      } else {
        // Producto por caja: comportamiento actual intacto.
        qty = parseFloat(quantity);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Ingresa la cantidad de cajas');

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
      }

      // Resolver la tarifa vigente del SUJETO del paño (variedad si la tiene, o
      // producto). online consulta directa; offline usa la caché por producto.
      // En ambos casos debe ser > 0 (rate_amount_snapshot).
      let rateAmount: number | undefined;
      if (online) {
        let rq = supabase.from('rates').select('amount').eq('product_id', selectedBlock.product_id).eq('status', 'current');
        rq = selectedBlock.variety_id ? rq.eq('variety_id', selectedBlock.variety_id) : rq.is('variety_id', null);
        const { data: rate } = await rq.single();
        rateAmount = rate ? Number(rate.amount) : ratesByProduct?.[selectedBlock.product_id];
      } else {
        rateAmount = ratesByProduct?.[selectedBlock.product_id];
      }
      if (!rateAmount || rateAmount <= 0) throw new Error('Sin tarifa vigente para este producto');

      // Base pagable (cajas o kg) para estimar el total con la tarifa cacheada.
      const payableBase = paymentUnit === 'kg' ? (paidQuantityKg ?? 0) : qty;

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
        // Unidad de pago y base en kg (null para caja; CHECK chk_picking_paid_kg).
        payment_unit: paymentUnit,
        paid_quantity_kg: paidQuantityKg,
        rate_amount_snapshot: rateAmount,
        work_day: await tenantWorkday(0),
        recorded_by: currentWorker?.id ?? null,
        // Congela la atribución del día: bajo qué responsable/equipo se cosechó.
        day_roster_id: selectedWorker.day_roster_id,
        // Snapshot de destare (null cuando no aplica el control de peso).
        ...boxFields,
      };

      // Total estimado = base pagable (cajas o kg) * tarifa (misma fórmula que
      // pickingSubtotal de @fundo360/shared; mantener en sincronía).
      const estimatedTotal = Math.round(payableBase * rateAmount * 100) / 100;

      if (online) {
        // Incluye el id de cliente y la ruta de la foto (si se subió).
        const { error } = await supabase.from('picking_records').insert({ ...record, id: recordId, backup_image_path: backupImagePath });
        if (error) throw error;
        return { base: payableBase, unit: paymentUnit, total: estimatedTotal, workerName: selectedWorker.full_name, queued: false, outOfTolerance: boxFields.out_of_tolerance, netWeight: boxFields.net_weight_kg, photoSkippedOffline, hasPhoto: !!backupImagePath };
      }

      // Offline: encolar para sincronizar al reconectar.
      await enqueue({ type: 'picking_insert', payload: record });
      return { base: payableBase, unit: paymentUnit, total: estimatedTotal, workerName: selectedWorker.full_name, queued: true, outOfTolerance: boxFields.out_of_tolerance, netWeight: boxFields.net_weight_kg, photoSkippedOffline, hasPhoto: false };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['production'] });

      // Alerta de merma NO bloqueante: el registro ya se guardó (y quedó auditado
      // con out_of_tolerance). Solo se informa; el supervisor decide qué hacer.
      if (data.outOfTolerance && selectedBoxType) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showAlert(
          'Peso fuera de tolerancia',
          `Neto ${data.netWeight} kg vs objetivo ${selectedBoxType.target_net_weight_kg} kg (${selectedBoxType.name}). ` +
            'El registro se guardó y quedó marcado para revisión. Ajusta la caja para evitar merma.',
          [{ text: 'Entendido' }],
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Aviso si la foto de respaldo no se pudo adjuntar por estar sin conexión.
      if (data.photoSkippedOffline) {
        showAlert('Foto no adjuntada', 'El registro se guardó, pero la foto de respaldo requiere conexión. Vuelve a adjuntarla con señal si es necesario.');
      }

      const unitWord = data.unit === 'kg' ? 'kg' : 'cajas';
      const baseLabel = `${data.base} ${unitWord}`;
      setSuccessData({
        title: data.queued ? `${baseLabel} en espera` : `${baseLabel} registradas`,
        subtitle: data.queued
          ? `${data.workerName} → se sincronizará al reconectar`
          : `${data.workerName} → ${formatMoney(data.total)}`,
      });
    },
    onError: (err: any) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); showAlert('Error', err.message); },
  });

  // "Leer balanza": conecta si hace falta y vuelca el último peso estabilizado en
  // el input manual de kilos (manualKg). El input sigue editable como respaldo.
  async function handleReadScale() {
    if (!scaleApplies) return;
    Haptics.selectionAsync();
    if (scale.status !== 'connected') {
      await scale.connect();
    }
    const kg = scale.lastWeightKg;
    if (kg !== null && Number.isFinite(kg)) {
      setManualKg(String(round3(kg)));
    }
  }

  function resetForSameBlock() { setStep('scan'); setQrInput(''); setShowScanner(false); setSelectedWorker(null); setSelectedRow(null); setQuantity(''); setManualKg(''); setSelectedBoxType(null); setGrossWeight(''); setPhotoUri(null); setShowPhoto(false); scale.clearLog(); }
  function resetForm() { setStep('scan'); setQrInput(''); setShowScanner(false); setSelectedWorker(null); setSelectedBlock(null); setSelectedRow(null); setRowChoices([]); setQuantity(''); setManualKg(''); setSelectedBoxType(null); setGrossWeight(''); setPhotoUri(null); setShowPhoto(false); }

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
              <AppText style={s.quickLabel}>Paño seleccionado</AppText>
              <View style={s.chipRow}>
                <Ionicons name="location" size={14} color="#1e40af" />
                <AppText style={s.quickValue}>{selectedBlock.name}</AppText>
              </View>
            </View>
            <TouchableOpacity onPress={() => setSelectedBlock(null)} style={s.quickChange}><AppText style={s.quickChangeText}>Cambiar</AppText></TouchableOpacity>
          </View>
        )}

        <View style={s.center}>
          <TouchableOpacity style={s.scanBtn} onPress={() => setShowScanner(true)} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={40} color={colors.primary} />
            <AppText style={s.scanBtnText}>Escanear Badge</AppText>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} /><AppText style={s.dividerText}>o manual</AppText><View style={s.dividerLine} />
          </View>

          <AppTextInput style={s.input} placeholder="Código del badge" placeholderTextColor={colors.textMuted}
            value={qrInput} onChangeText={setQrInput} onSubmitEditing={handleScan} />
          <TouchableOpacity style={s.primaryBtn} onPress={handleScan} activeOpacity={0.85}>
            <AppText style={s.primaryBtnText}>Identificar</AppText>
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

        <View style={[s.workerChip, s.chipRow]}>
          <Ionicons name="person" size={13} color={colors.primaryDark} />
          <AppText style={s.workerChipText}>{selectedWorker?.full_name}</AppText>
        </View>

        <FlatList
          data={blocks || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.blockCard} onPress={() => chooseBlock(item)} activeOpacity={0.7}>
              <View>
                <AppText style={s.blockName}>{item.name}</AppText>
                <AppText style={s.blockProduct}>{item.product_name}</AppText>
              </View>
              <AppText style={s.blockArrow}>›</AppText>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><AppText style={s.emptyText}>Sin paños disponibles</AppText></View>}
        />
        <TouchableOpacity style={[s.backBtn, s.chipRow]} onPress={resetForm}>
          <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
          <AppText style={s.backBtnText}>Volver</AppText>
        </TouchableOpacity>
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

        <View style={[s.workerChip, s.chipRow]}>
          <Ionicons name="person" size={13} color={colors.primaryDark} />
          <AppText style={s.workerChipText}>{selectedWorker?.full_name}</AppText>
          <AppText style={s.workerChipText}>  •  </AppText>
          <Ionicons name="location" size={13} color={colors.primaryDark} />
          <AppText style={s.workerChipText}>{selectedBlock?.name}</AppText>
        </View>

        <AppText style={s.rowHint}>Seleccione la melga</AppText>

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
                  <View style={s.rowNumberBadge}><AppText style={s.rowNumberText}>{item.row_number}</AppText></View>
                )}
                <AppText style={s.blockName}>{item.name}</AppText>
              </View>
              <AppText style={s.blockArrow}>›</AppText>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.empty}><AppText style={s.emptyText}>Sin melgas disponibles</AppText></View>}
        />
        <TouchableOpacity style={[s.backBtn, s.chipRow]} onPress={() => setStep('select-block')}>
          <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
          <AppText style={s.backBtnText}>Paño</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  // ¿Se puede confirmar? Depende de la unidad y del control de destare:
  //  - kg manual: kilos > 0.
  //  - kg/caja con destare: tipo de caja elegido + peso bruto > 0.
  //  - caja sin destare: cantidad de cajas > 0.
  const grossOk = parseFloat(grossWeight) > 0;
  const canSubmit = kgManualApplies
    ? parseFloat(manualKg) > 0
    : kgTareApplies
      ? !!selectedBoxType && grossOk
      : (parseFloat(quantity) > 0 && (!tareApplies || !selectedBoxType || grossOk));

  // QUANTITY
  return (
    <View style={s.container}>
        {successOverlay}
      <View style={s.stepBar}>
        <View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepDone]} /><View style={[s.stepLine, s.stepLineDone]} /><View style={[s.stepDot, s.stepActive]} />
      </View>

      <View style={[s.workerChip, s.chipRow]}>
        <Ionicons name="person" size={13} color={colors.primaryDark} />
        <AppText style={s.workerChipText}>{selectedWorker?.full_name}</AppText>
        <AppText style={s.workerChipText}>  •  </AppText>
        <Ionicons name="location" size={13} color={colors.primaryDark} />
        <AppText style={s.workerChipText}>{selectedBlock?.name}</AppText>
        {selectedRow ? (
          <>
            <AppText style={s.workerChipText}>  •  </AppText>
            <Ionicons name="leaf-outline" size={13} color={colors.primaryDark} />
            <AppText style={s.workerChipText}>{selectedRow.name}</AppText>
          </>
        ) : null}
      </View>

      <View style={s.center}>
        {/* kg manual: se capturan los kilos. kg con destare: la base la deriva el
            peso de la caja (no se escribe cantidad). Caja: cantidad de cajas. */}
        {kgManualApplies ? (
          <>
            <AppTextInput style={s.bigInput} placeholder="0" placeholderTextColor={colors.primaryMuted}
              value={manualKg} onChangeText={setManualKg} keyboardType="numeric" autoFocus selectTextOnFocus />
            <AppText style={s.unitLabel}>kilos</AppText>

            {/* Lectura de balanza Bluetooth (solo Android + flag bluetooth_scale).
                El input de arriba sigue editable siempre como respaldo manual. */}
            {scaleApplies && (
              <View style={s.scaleBox}>
                <TouchableOpacity
                  style={[s.scaleBtn, s.chipRow, scale.status === 'connecting' && { opacity: 0.6 }]}
                  onPress={handleReadScale}
                  disabled={scale.status === 'connecting'}
                  activeOpacity={0.85}
                >
                  <Ionicons name="bluetooth" size={18} color={colors.primary} />
                  <AppText style={s.scaleBtnText}>Leer balanza</AppText>
                </TouchableOpacity>

                <AppText style={[s.scaleStatus, scale.status === 'error' && s.scaleStatusError]}>
                  {scale.status === 'connecting'
                    ? 'Conectando…'
                    : scale.status === 'connected'
                      ? `Balanza conectada${scale.lastWeightKg !== null ? ` · ${round3(scale.lastWeightKg)} kg` : ''}`
                      : scale.status === 'error'
                        ? scale.error ?? 'Sin conexión con la balanza'
                        : 'Balanza desconectada'}
                </AppText>

                <TouchableOpacity onPress={() => setShowScaleDebug((v) => !v)} activeOpacity={0.7}>
                  <AppText style={s.scaleDebugToggle}>{showScaleDebug ? 'Ocultar crudo' : 'Ver crudo'}</AppText>
                </TouchableOpacity>

                {showScaleDebug && (
                  <View style={s.scaleDebugPanel}>
                    {/* Selector de dispositivos emparejados (bonded). */}
                    <View style={s.chipRow}>
                      <TouchableOpacity onPress={() => { void scale.refreshDevices(); }} activeOpacity={0.7}>
                        <AppText style={s.scaleDebugAction}>Buscar emparejados</AppText>
                      </TouchableOpacity>
                      <AppText style={s.scaleDebugAction}>  ·  </AppText>
                      <TouchableOpacity onPress={() => scale.clearLog()} activeOpacity={0.7}>
                        <AppText style={s.scaleDebugAction}>Limpiar</AppText>
                      </TouchableOpacity>
                    </View>
                    {scale.devices.map((d) => (
                      <TouchableOpacity key={d.address} onPress={() => { void scale.connect(d.address); }} activeOpacity={0.7}>
                        <AppText style={s.scaleDeviceRow}>{d.name ?? '(sin nombre)'} — {d.address}</AppText>
                      </TouchableOpacity>
                    ))}
                    {/* Stream crudo: cada línea tal cual se recibió, con los
                        terminadores CR/LF visibles para afinar el parser. */}
                    <ScrollView style={s.scaleRawScroll} nestedScrollEnabled>
                      {scale.rawLog.length === 0 ? (
                        <AppText style={s.scaleRawEmpty}>Sin datos todavía. Conecta y pesa para capturar el stream.</AppText>
                      ) : (
                        scale.rawLog.map((line, i) => (
                          <AppText key={i} style={s.scaleRawLine} selectable>
                            {line.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}
                          </AppText>
                        ))
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </>
        ) : kgTareApplies ? (
          <AppText style={s.unitLabel}>Pesa la caja para registrar los kilos</AppText>
        ) : (
          <>
            <AppTextInput style={s.bigInput} placeholder="0" placeholderTextColor={colors.primaryMuted}
              value={quantity} onChangeText={setQuantity} keyboardType="numeric" autoFocus selectTextOnFocus />
            <AppText style={s.unitLabel}>cajas</AppText>
          </>
        )}

        {(tareApplies || kgTareApplies) && (
          <View style={s.tareBox}>
            <AppText style={s.tareLabel}>Tipo de caja</AppText>
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
                    <AppText style={[s.tareChipText, active && s.tareChipTextActive]}>{bt.name}</AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedBoxType && (
              <>
                <AppTextInput
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
                    <AppText style={[s.tareNet, ev.out_of_tolerance && s.tareNetWarn]}>
                      Neto {ev.net_weight_kg} kg {ev.out_of_tolerance ? '— fuera de tolerancia' : '— dentro de rango'}
                    </AppText>
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
                  <AppText style={s.photoLabel}>Foto de respaldo adjunta</AppText>
                  <View style={s.photoActions}>
                    <TouchableOpacity onPress={() => setShowPhoto(true)}><AppText style={s.photoAction}>Reemplazar</AppText></TouchableOpacity>
                    <TouchableOpacity onPress={() => setPhotoUri(null)}><AppText style={[s.photoAction, s.photoActionRemove]}>Quitar</AppText></TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.photoBtn} onPress={() => setShowPhoto(true)} activeOpacity={0.85}>
                <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />
                <AppText style={s.photoBtnText}>Agregar foto de respaldo</AppText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={s.bottomRow}>
        <TouchableOpacity style={[s.backBtn2, s.chipRow]} onPress={() => setStep(rowChoices.length > 0 ? 'select-row' : 'select-block')}>
          <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
          <AppText style={s.backBtnText}>{rowChoices.length > 0 ? 'Melga' : 'Paño'}</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.confirmBtn, s.chipRow, (!canSubmit || submitMutation.isPending) && { opacity: 0.4 }]}
          onPress={() => submitMutation.mutate()}
          disabled={!canSubmit || submitMutation.isPending} activeOpacity={0.85}>
          {submitMutation.isPending ? (
            <AppText style={s.confirmBtnText}>...</AppText>
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color={colors.textWhite} />
              <AppText style={s.confirmBtnText}>Confirmar</AppText>
            </>
          )}
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
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
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
  // Lectura de balanza Bluetooth (solo Android + flag bluetooth_scale)
  scaleBox: { width: '100%', marginTop: spacing.lg, alignItems: 'center' },
  scaleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.primaryMuted, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: spacing.lg, backgroundColor: colors.primaryBg },
  scaleBtnText: { fontSize: 15, fontWeight: font.semibold, color: colors.primary },
  scaleStatus: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  scaleStatusError: { color: colors.red },
  scaleDebugToggle: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline', marginTop: spacing.sm },
  scaleDebugPanel: { width: '100%', marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder },
  scaleDebugAction: { fontSize: 13, fontWeight: font.medium, color: colors.primary },
  scaleDeviceRow: { fontSize: 12, color: colors.textSecondary, paddingVertical: 4 },
  scaleRawScroll: { maxHeight: 160, marginTop: spacing.sm, backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm },
  scaleRawEmpty: { fontSize: 12, color: colors.textMuted },
  scaleRawLine: { fontSize: 12, color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
