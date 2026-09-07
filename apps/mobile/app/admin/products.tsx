import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { createProductSchema } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { formatMoney } from '../../src/utils/format';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../src/components/form/FormControls';

type RateRow = { amount: number; status: string };
type ProductRow = {
  id: string;
  name: string;
  unit_measure: string;
  status: string;
  rates?: RateRow[];
};

const UNIT_OPTIONS = [
  { value: 'box', label: 'Caja' },
  { value: 'kg', label: 'Kilo' },
];

function currentRate(p: ProductRow): number | null {
  const cur = (p.rates || []).find((r) => r.status === 'current');
  return cur ? Number(cur.amount) : null;
}

export default function AdminProductsScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [formProduct, setFormProduct] = useState<ProductRow | 'new' | null>(null);
  const [rateProduct, setRateProduct] = useState<ProductRow | null>(null);

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit_measure, status, rates(amount, status)')
        .order('name');
      if (error) throw error;
      return data as unknown as ProductRow[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (p: ProductRow) => {
      const newStatus = p.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('products').update({ status: newStatus }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filtered = (products || []).filter((p) =>
    !search.trim() ? true : p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function confirmToggle(p: ProductRow) {
    const activating = p.status !== 'active';
    Alert.alert(
      activating ? 'Activar producto' : 'Desactivar producto',
      `¿${activating ? 'Activar' : 'Desactivar'} "${p.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(p) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar producto…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const rate = currentRate(item);
          const unit = item.unit_measure === 'kg' ? 'Kilo' : 'Caja';
          return (
            <RowItem
              title={item.name}
              subtitle={`${unit} · ${rate != null ? `Tarifa ${formatMoney(rate)}` : 'Sin tarifa'}`}
              icon={item.unit_measure === 'kg' ? 'scale' : 'cube'}
              iconColor={item.status === 'active' ? colors.violet : colors.textMuted}
              badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
              right={
                <View style={s.actions}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => setRateProduct(item)}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.amber} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => setFormProduct(item)}>
                    <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => confirmToggle(item)}>
                    <Ionicons name={item.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={item.status === 'active' ? colors.red : colors.primary} />
                  </TouchableOpacity>
                </View>
              }
            />
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton count={5} />
          ) : (
            <EmptyState
              icon="pricetag-outline"
              title={search ? 'Sin resultados' : 'Sin productos'}
              message={search ? 'Prueba con otro término.' : 'Crea el primer producto con el botón +.'}
              iconColor={colors.violet}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormProduct('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <ProductFormModal
        target={formProduct}
        onClose={() => setFormProduct(null)}
        onSaved={() => {
          setFormProduct(null);
          queryClient.invalidateQueries({ queryKey: ['admin-products'] });
        }}
      />

      <RateManagerModal
        product={rateProduct}
        onClose={() => setRateProduct(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['admin-products'] })}
      />
    </View>
  );
}

function ProductFormModal({
  target, onClose, onSaved,
}: {
  target: ProductRow | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as ProductRow) : null;

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('box');
  const [initialRate, setInitialRate] = useState(''); // solo al crear
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setUnit(initial?.unit_measure ?? 'box');
    setInitialRate('');
    setErrors({});
  }

  async function handleSubmit() {
    const raw = { name: name.trim(), unit_measure: unit };
    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') errs[path] = issue.message;
      }
      setErrors(errs);
      return;
    }
    // Validar tarifa inicial opcional (solo al crear).
    let rateNum: number | null = null;
    if (!isEdit && initialRate.trim()) {
      rateNum = parseFloat(initialRate);
      if (isNaN(rateNum) || rateNum <= 0) {
        setErrors({ rate: 'La tarifa debe ser mayor a 0' });
        return;
      }
    }
    setErrors({});
    setLoading(true);
    try {
      if (isEdit && initial) {
        const { error } = await supabase
          .from('products')
          .update({ name: parsed.data.name, unit_measure: parsed.data.unit_measure })
          .eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { data: created, error } = await supabase
          .from('products')
          .insert({ name: parsed.data.name, unit_measure: parsed.data.unit_measure })
          .select('id')
          .single();
        if (error) throw error;
        // Tarifa inicial opcional → primera tarifa vigente del producto.
        if (created && rateNum && rateNum > 0) {
          const { error: rErr } = await supabase.from('rates').insert({
            product_id: created.id,
            amount: rateNum,
            status: 'current',
          });
          if (rErr) throw rErr;
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar el producto');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar producto' : 'Nuevo producto'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Arándano" />
            </Field>
            <Field label="Unidad de medida" required error={errors.unit_measure}>
              <SelectField value={unit} options={UNIT_OPTIONS} onChange={setUnit} hasError={!!errors.unit_measure} />
            </Field>
            {!isEdit && (
              <Field label="Tarifa inicial ($)" error={errors.rate}>
                <TextField value={initialRate} onChangeText={setInitialRate} hasError={!!errors.rate} placeholder="Opcional" keyboardType="decimal-pad" />
              </Field>
            )}
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear producto'} loading={loading} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RateManagerModal({
  product, onClose, onChanged,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [newRate, setNewRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const key = product?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (product && key !== lastKey) {
    setLastKey(key);
    setNewRate('');
    setError(null);
  }

  const { data: rates, isLoading, refetch } = useQuery({
    queryKey: ['admin-rates', product?.id],
    enabled: !!product?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rates')
        .select('id, amount, status, created_at')
        .eq('product_id', product!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as { id: string; amount: number; status: string; created_at: string }[];
    },
  });

  const current = (rates || []).find((r) => r.status === 'current');
  const history = (rates || []).filter((r) => r.status === 'historical');

  async function handleSetRate() {
    const amount = parseFloat(newRate);
    if (!amount || amount <= 0) {
      setError('Ingrese un monto mayor a 0');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Mecanismo de historial de tarifas: la tarifa vigente pasa a histórica,
      // y se inserta la nueva como vigente. rate_amount_snapshot de registros
      // pasados NO cambia (inmutable), solo aplica a nuevos registros.
      const { error: histErr } = await supabase
        .from('rates')
        .update({ status: 'historical' })
        .eq('product_id', product!.id)
        .eq('status', 'current');
      if (histErr) throw histErr;

      const { error: insErr } = await supabase.from('rates').insert({
        product_id: product!.id,
        amount,
        status: 'current',
      });
      if (insErr) throw insErr;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewRate('');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      onChanged();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e.message || 'No se pudo actualizar la tarifa');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!product} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Tarifas — {product?.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            {/* Tarifa vigente */}
            <View style={s.currentCard}>
              <Text style={s.currentLabel}>TARIFA VIGENTE</Text>
              <Text style={s.currentValue}>{current ? formatMoney(Number(current.amount)) : 'Sin tarifa'}</Text>
              {current ? (
                <Text style={s.currentSince}>Desde {new Date(current.created_at).toLocaleDateString('es-CL')}</Text>
              ) : null}
            </View>

            {/* Nueva tarifa */}
            <Field label="Nueva tarifa ($)" error={error || undefined}>
              <TextField value={newRate} onChangeText={setNewRate} hasError={!!error} placeholder="Ej: 350" keyboardType="decimal-pad" />
            </Field>
            <SubmitButton label="Actualizar tarifa" loading={loading} onPress={handleSetRate} />

            {/* Historial */}
            {isLoading ? null : history.length > 0 ? (
              <View style={{ marginTop: spacing.xl }}>
                <Text style={s.histTitle}>Historial</Text>
                {history.map((r) => (
                  <View key={r.id} style={s.histRow}>
                    <Text style={s.histAmount}>{formatMoney(Number(r.amount))}</Text>
                    <Text style={s.histDate}>{new Date(r.created_at).toLocaleDateString('es-CL')}</Text>
                    <View style={s.histBadge}><Text style={s.histBadgeText}>Histórica</Text></View>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, marginHorizontal: spacing.lg, marginTop: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: { padding: 6, borderRadius: radius.sm },
  fab: {
    position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  sheetTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
  currentCard: { backgroundColor: colors.primaryBg, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  currentLabel: { fontSize: 11, fontWeight: font.semibold, color: colors.primary, letterSpacing: 0.5 },
  currentValue: { fontSize: 30, fontWeight: font.extrabold, color: colors.primary, marginTop: 4 },
  currentSince: { fontSize: 12, color: colors.primary, marginTop: 2 },
  histTitle: { fontSize: 12, fontWeight: font.semibold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  histAmount: { fontSize: 14, fontWeight: font.semibold, color: colors.text, flex: 1 },
  histDate: { fontSize: 13, color: colors.textMuted },
  histBadge: { backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  histBadgeText: { fontSize: 11, color: colors.textMuted },
});
