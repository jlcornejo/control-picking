import { useCallback, useState } from 'react';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CAPABILITIES } from '@fundo360/shared';
import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { EmptyState } from '../../src/components/EmptyState';
import { PaymentsSkeleton } from '../../src/components/Skeleton';
import { usePermissions } from '../../src/hooks/usePermissions';
import { useReportExport } from '../../src/hooks/useReportExport';
import { useSettlementsList, type SettlementListItem } from '../../src/hooks/useSettlements';
import {
  printSettlement,
  type SettlementPdfData,
  type SettlementPdfRecord,
} from '../../src/lib/export/settlement-pdf';
import { supabase } from '../../src/lib/supabase';
import { showAlert } from '../../src/lib/alert';
import type { Envelope } from '../../src/lib/edge';
import { colors, radius, spacing, font } from '../../src/constants/theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Internal payload returned by POST /settlements/generate (inside the envelope). */
interface GeneratedSettlement {
  id: string;
  payee_type: 'worker' | 'crew';
}
interface GenerateSettlementsResponse {
  settlements: GeneratedSettlement[];
  total_amount: number;
  units_by_unit: { box: number; kg: number };
}

/** Type guard over the inner payload (NFR1): never assume the envelope shape. */
function isGenerateResponse(value: unknown): value is GenerateSettlementsResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.settlements) && typeof v.total_amount === 'number';
}

/** Breakdown row returned by GET /settlements/:id (inside the envelope). */
interface SettlementDetailRecord {
  work_day: string;
  block_name: string;
  product_name: string;
  variety_name: string | null;
  payment_unit: string;
  base: number;
  rate: number;
  subtotal: number;
}
/** Payment row returned by GET /settlements/:id. */
interface SettlementDetailPayment {
  amount: number;
  paid_at: string;
  notes: string | null;
}
/** Internal payload returned by GET /settlements/:id (inside the envelope). */
interface SettlementDetail {
  period_start: string;
  period_end: string;
  total_amount: number;
  status: string;
  payee_type?: 'worker' | 'crew';
  workers?: { full_name?: string } | null;
  breakdown: SettlementDetailRecord[];
  payments: SettlementDetailPayment[];
}

/** Type guard over the settlement detail payload (NFR1). */
function isSettlementDetail(value: unknown): value is SettlementDetail {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.breakdown) && typeof v.total_amount === 'number';
}

const statusLabel: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' };
const statusColor: Record<string, string> = { pending: colors.amber, partial: colors.orange, paid: colors.primary };

export default function SettlementsScreen() {
  return (
    <AdminGuard>
      <SettlementsContent />
    </AdminGuard>
  );
}

function SettlementsContent() {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canManage = has(CAPABILITIES.SETTLEMENTS_MANAGE);
  const { showPdf } = useReportExport();

  const [page, setPage] = useState(1);
  const { data: settlements, isLoading, refetch } = useSettlementsList({ page });
  const [refreshing, setRefreshing] = useState(false);
  // Id of the settlement whose PDF is currently being generated.
  const [exportingId, setExportingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function closeModal() {
    setModalOpen(false);
    setPeriodStart('');
    setPeriodEnd('');
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      // Delegate 100% to the Edge Function. Never insert into settlements from
      // the client, and never read the direct payload — always the envelope.
      const { data, error } = await supabase.functions.invoke<Envelope<GenerateSettlementsResponse>>(
        'settlements/generate',
        { method: 'POST', body: { period_start: periodStart, period_end: periodEnd } },
      );
      if (error || data?.success === false) {
        // Prefer the backend (Spanish) message over the generic FunctionsHttpError.
        throw new Error(data?.error?.message ?? 'No se pudieron generar las liquidaciones');
      }
      if (!isGenerateResponse(data?.data)) {
        throw new Error('Respuesta inválida del servidor');
      }
      return data!.data!;
    },
    onSuccess: (result) => {
      closeModal();
      // Refresh the drawer list and the Pagos tab queries.
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      queryClient.invalidateQueries({ queryKey: ['my-balance'] });
      queryClient.invalidateQueries({ queryKey: ['my-settlements'] });

      if (result.settlements.length === 0) {
        if (result.total_amount > 0) {
          // Production existed but the period was already settled.
          showAlert('Nada nuevo que generar', 'Las liquidaciones del período ya estaban generadas.');
        } else {
          showAlert('Sin producción', 'No se encontró producción para el período.');
        }
      } else {
        showAlert('Listo', `${result.settlements.length} liquidación(es) generada(s).`);
      }
    },
    onError: (err: Error) => {
      // Backend error message (Spanish); the screen stays usable.
      showAlert('Error', err.message);
    },
  });

  function handleGenerate() {
    const start = periodStart.trim();
    const end = periodEnd.trim();
    // Client-side validation (G1-AC2): do NOT invoke the backend on invalid input.
    if (!start || !end) {
      showAlert('Rango inválido', 'Debes indicar las fechas Desde y Hasta.');
      return;
    }
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      showAlert('Rango inválido', 'Usa el formato AAAA-MM-DD en ambas fechas.');
      return;
    }
    if (start > end) {
      showAlert('Rango inválido', 'La fecha Desde no puede ser posterior a la fecha Hasta.');
      return;
    }
    generateMutation.mutate();
  }

  // PDF por liquidación (G5-AC3): detalle desde settlements/:id (read-only) y
  // render con expo-print. El sobre se lee de data.data; errores de data.error.
  async function handleExportPdf(item: SettlementListItem) {
    setExportingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke<Envelope<SettlementDetail>>(
        `settlements/${item.id}`,
        { method: 'GET' },
      );
      if (error || data?.success === false) {
        throw new Error(data?.error?.message ?? 'No se pudo obtener la liquidación.');
      }
      if (!isSettlementDetail(data?.data)) {
        throw new Error('Respuesta inválida del servidor.');
      }
      const detail = data!.data!;
      if (detail.breakdown.length === 0) {
        showAlert('Sin datos', 'La liquidación no tiene producción para exportar.');
        return;
      }

      const records: SettlementPdfRecord[] = detail.breakdown.map((r) => ({
        work_day: r.work_day,
        block_name: r.block_name,
        product_name: r.product_name,
        variety_name: r.variety_name,
        payment_unit: r.payment_unit,
        base: Number(r.base),
        rate: Number(r.rate),
        subtotal: Number(r.subtotal),
      }));

      const pdfData: SettlementPdfData = {
        workerName: item.payee_name || detail.workers?.full_name || '—',
        workerRut: null,
        periodStart: detail.period_start,
        periodEnd: detail.period_end,
        totalAmount: Number(detail.total_amount),
        status: detail.status,
        payeeType: detail.payee_type ?? item.payee_type,
        records,
        payments: detail.payments.map((p) => ({
          date: new Date(p.paid_at).toLocaleDateString('es-CL'),
          amount: Number(p.amount),
          notes: p.notes ?? '',
        })),
      };

      await printSettlement(pdfData);
    } catch (err) {
      showAlert('Error', err instanceof Error ? err.message : 'No se pudo exportar el PDF.');
    } finally {
      setExportingId(null);
    }
  }

  const hasPrevPage = page > 1;
  const hasNextPage = (settlements?.length ?? 0) >= 20;

  return (
    <View style={s.container}>
      {canManage && (
        <View style={s.toolbar}>
          <TouchableOpacity style={s.generateBtn} onPress={() => setModalOpen(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={18} color={colors.textWhite} />
            <Text style={s.generateBtnText}>Generar liquidaciones</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={settlements ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <SettlementCard
            item={item}
            showPdf={showPdf}
            exporting={exportingId === item.id}
            onExportPdf={() => handleExportPdf(item)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <PaymentsSkeleton />
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="Sin liquidaciones"
              message="Aún no hay liquidaciones generadas."
              iconColor={colors.primary}
            />
          )
        }
        ListFooterComponent={
          (settlements?.length ?? 0) > 0 || hasPrevPage ? (
            <View style={s.pager}>
              <TouchableOpacity
                style={[s.pagerBtn, !hasPrevPage && s.pagerBtnDisabled]}
                disabled={!hasPrevPage}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                activeOpacity={0.7}
              >
                <Text style={[s.pagerBtnText, !hasPrevPage && s.pagerBtnTextDisabled]}>Anterior</Text>
              </TouchableOpacity>
              <Text style={s.pagerLabel}>Página {page}</Text>
              <TouchableOpacity
                style={[s.pagerBtn, !hasNextPage && s.pagerBtnDisabled]}
                disabled={!hasNextPage}
                onPress={() => setPage((p) => p + 1)}
                activeOpacity={0.7}
              >
                <Text style={[s.pagerBtnText, !hasNextPage && s.pagerBtnTextDisabled]}>Siguiente</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Generar liquidaciones</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.modalHint}>
                Se generan las liquidaciones de la producción del período. Las que ya existan no se modifican.
              </Text>

              <Text style={s.modalLabel}>Desde (AAAA-MM-DD)</Text>
              <TextInput
                style={s.modalInput}
                value={periodStart}
                onChangeText={setPeriodStart}
                placeholder="2025-01-01"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={s.modalLabel}>Hasta (AAAA-MM-DD)</Text>
              <TextInput
                style={s.modalInput}
                value={periodEnd}
                onChangeText={setPeriodEnd}
                placeholder="2025-01-31"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />

              <View style={s.modalButtons}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={closeModal}>
                  <Text style={s.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalConfirmBtn, generateMutation.isPending && s.modalConfirmBtnDisabled]}
                  onPress={handleGenerate}
                  disabled={generateMutation.isPending}
                  activeOpacity={0.8}
                >
                  <Text style={s.modalConfirmText}>{generateMutation.isPending ? 'Generando...' : 'Generar'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SettlementCard({
  item,
  showPdf,
  exporting,
  onExportPdf,
}: {
  item: SettlementListItem;
  showPdf: boolean;
  exporting: boolean;
  onExportPdf: () => void;
}) {
  const owed = item.total_amount - item.total_paid;
  return (
    <View style={s.card}>
      <View style={s.cardTopRow}>
        <View style={{ flex: 1 }}>
          {item.payee_name ? <Text style={s.cardPayee}>{item.payee_name}</Text> : null}
          <Text style={s.cardPeriod}>
            {item.period_start} — {item.period_end}
          </Text>
        </View>
        <Text style={s.cardAmount}>${Math.round(item.total_amount).toLocaleString()}</Text>
      </View>
      <View style={s.cardBadgeRow}>
        <View style={[s.statusBadge, { backgroundColor: (statusColor[item.status] ?? colors.textMuted) + '20' }]}>
          <Text style={[s.statusText, { color: statusColor[item.status] ?? colors.textMuted }]}>
            {statusLabel[item.status] ?? item.status}
          </Text>
        </View>
        {item.total_paid > 0 && <Text style={s.paidLabel}>Pagado: ${Math.round(item.total_paid).toLocaleString()}</Text>}
      </View>
      {item.status !== 'paid' && owed > 0 && (
        <Text style={s.owedLabel}>Adeudado: ${Math.round(owed).toLocaleString()}</Text>
      )}
      {showPdf && (
        <TouchableOpacity
          style={[s.pdfBtn, exporting && s.pdfBtnDisabled]}
          onPress={onExportPdf}
          disabled={exporting}
          activeOpacity={0.8}
        >
          <Ionicons name="document-outline" size={15} color={colors.primary} />
          <Text style={s.pdfBtnText}>{exporting ? 'Generando PDF...' : 'Exportar PDF'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  generateBtnText: { color: colors.textWhite, fontSize: 15, fontWeight: font.semibold },
  card: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPayee: { fontSize: 13, fontWeight: font.bold, color: colors.primary, marginBottom: 2 },
  cardPeriod: { fontSize: 14, color: colors.textSecondary, fontWeight: font.medium },
  cardAmount: { fontSize: 18, fontWeight: font.bold, color: colors.primary },
  cardBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: font.semibold },
  paidLabel: { fontSize: 12, color: colors.textMuted },
  owedLabel: { fontSize: 13, fontWeight: font.bold, color: colors.red, marginTop: 4 },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.md,
    paddingVertical: 9,
  },
  pdfBtnDisabled: { opacity: 0.5 },
  pdfBtnText: { fontSize: 13, fontWeight: font.semibold, color: colors.primary },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.lg },
  pagerBtn: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { color: colors.text, fontSize: 14, fontWeight: font.medium },
  pagerBtnTextDisabled: { color: colors.textMuted },
  pagerLabel: { fontSize: 13, color: colors.textSecondary },
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
  modalHint: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  modalLabel: { fontSize: 13, fontWeight: font.medium, color: colors.textSecondary, marginTop: 16, marginBottom: 4 },
  modalInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: font.medium },
  modalConfirmBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  modalConfirmBtnDisabled: { opacity: 0.6 },
  modalConfirmText: { color: colors.textWhite, fontSize: 15, fontWeight: font.semibold },
});
