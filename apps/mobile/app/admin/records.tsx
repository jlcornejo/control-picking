import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { UnitMeasure, pickingPayableBase, pickingSubtotal } from '@fundo360/shared';
import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { supabase } from '../../src/lib/supabase';
import { usePickingCorrection, type CorrectableRecord } from '../../src/hooks/usePickingCorrection';
import { localDate } from '../../src/utils/date';
import { formatMoney, formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 20;
// Tope duro de filas de la query del período (defensivo; el rango default son 7 días).
const HARD_LIMIT = 1000;

/** Fila enriquecida que pinta la lista y alimenta resumen/CSV (set completo del período). */
interface EnrichedRecord {
  id: string;
  worker_id: string;
  block_id: string;
  quantity: number;
  payment_unit: 'box' | 'kg';
  paid_quantity_kg: number | null;
  net_weight_kg: number | null;
  rate_amount_snapshot: number;
  recorded_at: string;
  work_day: string;
  original_record_id: string | null;
  worker_name: string;
  national_id: string | null;
  block_name: string;
  product: string;
  variety: string;
  unit: string;
  base: number;
  subtotal: number;
  is_correction: boolean;
}

interface WorkerOption {
  id: string;
  full_name: string;
}

interface BlockOption {
  id: string;
  name: string;
  field_name: string;
}

const formatKg = (n: number) =>
  (Math.round(n * 1000) / 1000).toLocaleString('es-CL', { maximumFractionDigits: 3 });

export default function RecordsScreen() {
  return (
    <AdminGuard>
      <RecordsContent />
    </AdminGuard>
  );
}

function RecordsContent() {
  const [dateFrom, setDateFrom] = useState(localDate(-7));
  const [dateTo, setDateTo] = useState(localDate(0));
  const [workerId, setWorkerId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // Correction modal state (visibilidad del botón decidida aquí; mutación en el hook).
  const [correctRecord, setCorrectRecord] = useState<EnrichedRecord | null>(null);
  const [correctQty, setCorrectQty] = useState('');
  const correctMutation = usePickingCorrection();

  // Filter pickers
  const [filterModal, setFilterModal] = useState(false);

  /** Resetea la paginación a la primera página cuando cambia cualquier filtro. */
  const resetPage = useCallback(() => setPage(1), []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['records', dateFrom, dateTo, workerId, blockId],
    queryFn: async () => {
      // Una sola lectura del período filtrado con tope duro de 1000 filas.
      // Esta query es la fuente de verdad de lista, resumen y CSV (FEAT-006).
      let query = supabase
        .from('picking_records')
        .select(
          'id, worker_id, block_id, quantity, payment_unit, paid_quantity_kg, net_weight_kg, rate_amount_snapshot, recorded_at, work_day, original_record_id',
        )
        .gte('work_day', dateFrom)
        .lte('work_day', dateTo)
        .order('recorded_at', { ascending: false })
        .limit(HARD_LIMIT);

      if (workerId) query = query.eq('worker_id', workerId);
      if (blockId) query = query.eq('block_id', blockId);

      const { data: records, error } = await query;
      if (error) throw error;

      const rows = records ?? [];

      // Nombres de trabajador (con RUT) y paño (producto/variedad) por join manual.
      const workerIds = [...new Set(rows.map((r) => r.worker_id))];
      const blockIds = [...new Set(rows.map((r) => r.block_id))];

      const [{ data: workers }, { data: blocks }] = await Promise.all([
        supabase.from('workers').select('id, full_name, national_id').in('id', workerIds.length ? workerIds : ['x']),
        supabase
          .from('blocks')
          .select('id, name, products!fk_blocks_product_org(name), product_varieties!fk_blocks_variety_org(name)')
          .in('id', blockIds.length ? blockIds : ['x']),
      ]);

      const workerMap = Object.fromEntries(
        (workers ?? []).map((w) => [w.id, { full_name: w.full_name as string, national_id: (w.national_id as string | null) ?? null }]),
      );
      const blockMap = Object.fromEntries(
        (blocks ?? []).map((b) => {
          const row = b as { id: string; name: string; products?: { name?: string } | null; product_varieties?: { name?: string } | null };
          return [row.id, { name: row.name, product: row.products?.name ?? '', variety: row.product_varieties?.name ?? '' }];
        }),
      );

      const enriched: EnrichedRecord[] = rows.map((r) => {
        const unit = (r.payment_unit as string) || 'box';
        const payload = {
          payment_unit: unit as UnitMeasure,
          quantity: Number(r.quantity),
          paid_quantity_kg: r.paid_quantity_kg === null || r.paid_quantity_kg === undefined ? null : Number(r.paid_quantity_kg),
          rate_amount_snapshot: Number(r.rate_amount_snapshot),
        };
        return {
          id: r.id,
          worker_id: r.worker_id,
          block_id: r.block_id,
          quantity: Number(r.quantity),
          payment_unit: unit as 'box' | 'kg',
          paid_quantity_kg: payload.paid_quantity_kg,
          net_weight_kg: r.net_weight_kg === null || r.net_weight_kg === undefined ? null : Number(r.net_weight_kg),
          rate_amount_snapshot: Number(r.rate_amount_snapshot),
          recorded_at: r.recorded_at,
          work_day: r.work_day,
          original_record_id: (r.original_record_id as string | null) ?? null,
          worker_name: workerMap[r.worker_id]?.full_name || '—',
          national_id: workerMap[r.worker_id]?.national_id ?? null,
          block_name: blockMap[r.block_id]?.name || '—',
          product: blockMap[r.block_id]?.product ?? '',
          variety: blockMap[r.block_id]?.variety ?? '',
          unit,
          base: pickingPayableBase(payload),
          subtotal: pickingSubtotal(payload),
          is_correction: !!r.original_record_id,
        };
      });

      return { records: enriched, truncated: rows.length >= HARD_LIMIT };
    },
  });

  // Listas auxiliares para los filtros (trabajadores / paños activos).
  const { data: allWorkers } = useQuery({
    queryKey: ['records-workers-list'],
    queryFn: async (): Promise<WorkerOption[]> => {
      const { data: ws } = await supabase.from('workers').select('id, full_name').eq('status', 'active').order('full_name');
      return (ws ?? []).map((w) => ({ id: w.id, full_name: w.full_name }));
    },
  });

  const { data: allBlocks } = useQuery({
    queryKey: ['records-blocks-list'],
    queryFn: async (): Promise<BlockOption[]> => {
      const { data: bs } = await supabase.from('blocks').select('id, name, fields(name)').eq('status', 'active').order('name');
      return (bs ?? []).map((b) => {
        const row = b as { id: string; name: string; fields?: { name?: string } | null };
        return { id: row.id, name: row.name, field_name: row.fields?.name ?? '' };
      });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // El conteo "original" excluye las filas de corrección (original_record_id no nulo).
  const originals = useMemo(() => (data?.records ?? []).filter((r) => !r.is_correction), [data?.records]);
  // La lista muestra solo originales; se recorta en cliente para la paginación (NFR4).
  const visible = useMemo(() => originals.slice(0, page * PAGE_SIZE), [originals, page]);
  const hasMore = visible.length < originals.length;

  // Resumen agregado sobre el SET COMPLETO del período, segmentado por unidad.
  const summary = useMemo(() => {
    const all = data?.records ?? [];
    const totalBoxes = all.filter((r) => r.unit !== 'kg').reduce((sum, r) => sum + r.quantity, 0);
    const totalKg = all.filter((r) => r.unit === 'kg').reduce((sum, r) => sum + Number(r.paid_quantity_kg ?? 0), 0);
    const totalAmount = all.reduce((sum, r) => sum + r.subtotal, 0);
    const hasKg = all.some((r) => r.unit === 'kg');
    return { totalRecords: all.length, totalBoxes, totalKg, totalAmount, hasKg };
  }, [data?.records]);

  function setFromDate(value: string) {
    setDateFrom(value);
    resetPage();
  }
  function setToDate(value: string) {
    setDateTo(value);
    resetPage();
  }
  function selectWorker(id: string) {
    setWorkerId(id);
    resetPage();
  }
  function selectBlock(id: string) {
    setBlockId(id);
    resetPage();
  }

  function submitCorrection() {
    if (!correctRecord) return;
    const payload: CorrectableRecord = {
      id: correctRecord.id,
      worker_id: correctRecord.worker_id,
      block_id: correctRecord.block_id,
      quantity: correctRecord.quantity,
      payment_unit: correctRecord.payment_unit,
      paid_quantity_kg: correctRecord.paid_quantity_kg,
      rate_amount_snapshot: correctRecord.rate_amount_snapshot,
      work_day: correctRecord.work_day,
      unit: correctRecord.unit,
    };
    correctMutation.mutate(
      { record: payload, rawValue: correctQty },
      {
        onSuccess: () => {
          setCorrectRecord(null);
          setCorrectQty('');
        },
      },
    );
  }

  const activeWorkerName = allWorkers?.find((w) => w.id === workerId)?.full_name;
  const activeBlockName = allBlocks?.find((b) => b.id === blockId)?.name;

  return (
    <View style={s.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Filtros de fecha */}
        <View style={s.filters}>
          <View style={s.filterRow}>
            <View style={s.filterCol}>
              <Text style={s.filterLabel}>Desde</Text>
              <TextInput
                style={s.filterInput}
                value={dateFrom}
                onChangeText={setFromDate}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={s.filterCol}>
              <Text style={s.filterLabel}>Hasta</Text>
              <TextInput
                style={s.filterInput}
                value={dateTo}
                onChangeText={setToDate}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <TouchableOpacity style={s.filterPickerBtn} onPress={() => setFilterModal(true)} activeOpacity={0.7}>
            <Ionicons name="filter-outline" size={16} color={colors.primary} />
            <Text style={s.filterPickerText} numberOfLines={1}>
              {activeWorkerName ? `Trabajador: ${activeWorkerName}` : 'Trabajador: Todos'}
              {activeBlockName ? ` · Paño: ${activeBlockName}` : ' · Paño: Todos'}
            </Text>
          </TouchableOpacity>
          {(!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) && (
            <Text style={s.filterWarn}>Usa el formato AAAA-MM-DD en ambas fechas.</Text>
          )}
        </View>

        {/* Resumen agregado del período (set completo), segmentado por unidad */}
        {!isLoading && summary.totalRecords > 0 && (
          <View style={s.summaryRow}>
            <SummaryCard label="Registros" value={formatNumber(summary.totalRecords)} tint={colors.primary} bg={colors.primaryBg} />
            <SummaryCard label="Cajas" value={formatNumber(summary.totalBoxes)} tint={colors.amber} bg={colors.amberBg} />
            {summary.hasKg && (
              <SummaryCard label="Kilos" value={formatKg(summary.totalKg)} tint={colors.blue} bg={colors.blueBg} />
            )}
            <SummaryCard label="Total $" value={formatMoney(summary.totalAmount)} tint={colors.violet} bg={colors.violetBg} />
          </View>
        )}

        {data?.truncated && (
          <View style={s.truncateNotice}>
            <Ionicons name="warning-outline" size={16} color={colors.amber} />
            <Text style={s.truncateText}>Mostrando los primeros {HARD_LIMIT} registros; acota el período o los filtros.</Text>
          </View>
        )}

        {/* Lista (solo originales), paginada en cliente */}
        <View style={s.listWrap}>
          {isLoading ? (
            <ListSkeleton count={4} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title="Sin registros"
              message="No hay registros en el período seleccionado."
              iconColor={colors.primary}
            />
          ) : (
            <FlatList
              data={visible}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <RecordRow
                  item={item}
                  onCorrect={() => {
                    setCorrectQty(String(Number(item.base)));
                    setCorrectRecord(item);
                  }}
                />
              )}
            />
          )}

          {hasMore && (
            <TouchableOpacity style={s.loadMoreBtn} onPress={() => setPage((p) => p + 1)} activeOpacity={0.7}>
              <Text style={s.loadMoreText}>Cargar más</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Modal de filtros (trabajador / paño) */}
      <Modal visible={filterModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFilterModal(false)} />
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Filtrar</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.modalLabel}>Trabajador</Text>
              <OptionRow label="Todos" active={workerId === ''} onPress={() => selectWorker('')} />
              {(allWorkers ?? []).map((w) => (
                <OptionRow key={w.id} label={w.full_name} active={workerId === w.id} onPress={() => selectWorker(w.id)} />
              ))}

              <Text style={s.modalLabel}>Paño</Text>
              <OptionRow label="Todos" active={blockId === ''} onPress={() => selectBlock('')} />
              {(allBlocks ?? []).map((b) => (
                <OptionRow
                  key={b.id}
                  label={b.field_name ? `${b.name} — ${b.field_name}` : b.name}
                  active={blockId === b.id}
                  onPress={() => selectBlock(b.id)}
                />
              ))}

              <TouchableOpacity style={s.modalDoneBtn} onPress={() => setFilterModal(false)} activeOpacity={0.8}>
                <Text style={s.modalDoneText}>Aplicar</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de corrección */}
      <Modal visible={!!correctRecord} animationType="slide" transparent>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              setCorrectRecord(null);
              setCorrectQty('');
            }}
          />
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Corregir registro</Text>
            {correctRecord && (
              <View>
                <Text style={s.correctInfo}>
                  {correctRecord.worker_name} · {correctRecord.block_name}
                </Text>
                <Text style={s.correctInfoSub}>
                  Cantidad actual: {correctRecord.unit === 'kg' ? formatKg(Number(correctRecord.base)) : Number(correctRecord.base)}{' '}
                  {correctRecord.unit === 'kg' ? 'kg' : 'cajas'}
                </Text>
                <Text style={s.modalLabel}>{correctRecord.unit === 'kg' ? 'Nuevos kilos' : 'Nueva cantidad'}</Text>
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
                <Text style={s.correctHint}>
                  Se conserva el registro original como auditoría. Solo se puede corregir el día actual.
                </Text>
                <TouchableOpacity
                  style={[
                    s.correctConfirm,
                    (!correctQty || parseFloat(correctQty) <= 0 || correctMutation.isPending) && { opacity: 0.5 },
                  ]}
                  onPress={submitCorrection}
                  disabled={!correctQty || parseFloat(correctQty) <= 0 || correctMutation.isPending}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark" size={18} color={colors.textWhite} />
                  <Text style={s.correctConfirmText}>{correctMutation.isPending ? 'Guardando...' : 'Guardar corrección'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function RecordRow({ item, onCorrect }: { item: EnrichedRecord; onCorrect: () => void }) {
  const canCorrectToday = !item.is_correction && item.work_day === localDate(0);
  return (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardWorker}>{item.worker_name}</Text>
        <Text style={s.cardBlock}>{item.block_name}</Text>
        <Text style={s.cardMeta}>
          {item.work_day} ·{' '}
          {new Date(item.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.is_correction && (
          <View style={s.correctionBadge}>
            <Text style={s.correctionBadgeText}>Corrección</Text>
          </View>
        )}
      </View>
      <View style={s.cardRight}>
        <Text style={s.cardQty}>{item.unit === 'kg' ? formatKg(Number(item.base)) : Number(item.base)}</Text>
        <Text style={s.cardUnit}>{item.unit === 'kg' ? 'kg' : 'cj'}</Text>
        <Text style={s.cardEarn}>{formatMoney(Number(item.subtotal))}</Text>
        {canCorrectToday && (
          <TouchableOpacity style={s.correctBtn} onPress={onCorrect} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={s.correctBtnText}>Corregir</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SummaryCard({ label, value, tint, bg }: { label: string; value: string; tint: string; bg: string }) {
  return (
    <View style={[s.summaryCard, { backgroundColor: bg }]}>
      <Text style={[s.summaryLabel, { color: tint }]}>{label}</Text>
      <Text style={[s.summaryValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

function OptionRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.optionRow, active && s.optionRowActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.optionText, active && s.optionTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filters: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  filterCol: { flex: 1 },
  filterLabel: { fontSize: 12, fontWeight: font.medium, color: colors.textSecondary, marginBottom: 4 },
  filterInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  filterPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterPickerText: { flex: 1, fontSize: 13, fontWeight: font.medium, color: colors.primary },
  filterWarn: { fontSize: 12, color: colors.red },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  summaryCard: { flexGrow: 1, flexBasis: '47%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  summaryLabel: { fontSize: 12, fontWeight: font.medium },
  summaryValue: { fontSize: 20, fontWeight: font.bold, marginTop: 2 },
  truncateNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.amberBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  truncateText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  listWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardWorker: { fontSize: 13, fontWeight: font.bold, color: colors.primary, marginBottom: 2 },
  cardBlock: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
  cardMeta: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  correctionBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: colors.amberBg,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  correctionBadgeText: { fontSize: 11, fontWeight: font.semibold, color: colors.orange },
  cardRight: { alignItems: 'flex-end' },
  cardQty: { fontSize: 22, fontWeight: font.extrabold, color: colors.primary },
  cardUnit: { fontSize: 11, color: colors.textMuted, marginTop: -2 },
  cardEarn: { fontSize: 12, fontWeight: font.semibold, color: colors.primaryDark, marginTop: 4 },
  correctBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  correctBtnText: { fontSize: 12, fontWeight: font.semibold, color: colors.primary },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
  },
  loadMoreText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xxl,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: font.bold, color: colors.text, marginBottom: 12 },
  modalLabel: { fontSize: 13, fontWeight: font.medium, color: colors.textSecondary, marginTop: 16, marginBottom: 6 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: 6,
  },
  optionRowActive: { backgroundColor: colors.primaryBg },
  optionText: { flex: 1, fontSize: 14, color: colors.text },
  optionTextActive: { fontWeight: font.semibold, color: colors.primary },
  modalDoneBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  modalDoneText: { color: colors.textWhite, fontSize: 15, fontWeight: font.semibold },
  correctInfo: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  correctInfoSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  correctInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: font.bold,
    color: colors.text,
    textAlign: 'center',
  },
  correctHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  correctConfirm: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    marginTop: spacing.lg,
  },
  correctConfirmText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
});
