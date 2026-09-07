import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { createBlockSchema, createFieldRowSchema } from '@fundo360/shared';
import { supabase } from '../../../src/lib/supabase';
import { colors, radius, spacing, font } from '../../../src/constants/theme';
import { EmptyState } from '../../../src/components/EmptyState';
import { ListSkeleton } from '../../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../../src/components/form/FormControls';

type ProductOption = { id: string; name: string; unit_measure: string };
type BlockRow = {
  id: string;
  name: string;
  product_id: string;
  area: number;
  status: string;
  products?: { name: string; unit_measure: string } | null;
};

export default function FieldDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = String(id);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [formBlock, setFormBlock] = useState<BlockRow | 'new' | null>(null);
  const [rowsBlock, setRowsBlock] = useState<BlockRow | null>(null);

  const { data: field } = useQuery({
    queryKey: ['admin-field', fieldId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fields')
        .select('id, name, location, total_area, status, rows_enabled')
        .eq('id', fieldId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Default de uso de melgas de la organización (para resolver el efectivo del campo).
  const { data: org } = useQuery({
    queryKey: ['admin-org-rows-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('rows_enabled')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Modo Melga efectivo del campo: override del campo, o default de la organización.
  const rowsEnabledEffective =
    field?.rows_enabled === null || field?.rows_enabled === undefined
      ? (org?.rows_enabled ?? false)
      : field.rows_enabled;

  const { data: blocks, isLoading, refetch } = useQuery({
    queryKey: ['admin-blocks', fieldId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('id, name, product_id, area, status, products(name, unit_measure)')
        .eq('field_id', fieldId)
        .order('name');
      if (error) throw error;
      return data as unknown as BlockRow[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ['admin-products-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit_measure')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data as ProductOption[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (b: BlockRow) => {
      const newStatus = b.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('blocks').update({ status: newStatus }).eq('id', b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-blocks', fieldId] });
      queryClient.invalidateQueries({ queryKey: ['admin-fields'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function confirmToggle(b: BlockRow) {
    const activating = b.status !== 'active';
    Alert.alert(
      activating ? 'Activar paño' : 'Desactivar paño',
      `¿${activating ? 'Activar' : 'Desactivar'} el paño "${b.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus.mutate(b) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: field?.name || 'Campo' }} />

      <View style={s.headerCard}>
        <Text style={s.headerName}>{field?.name || '—'}</Text>
        <Text style={s.headerMeta}>
          {field?.location ? `${field.location} · ` : ''}{field?.total_area ?? '—'} ha · {(blocks || []).length} paño{(blocks || []).length === 1 ? '' : 's'}
        </Text>
      </View>

      <FlatList
        data={blocks || []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const unit = item.products?.unit_measure === 'kg' ? 'Kilo' : 'Caja';
          return (
            <RowItem
              title={item.name}
              subtitle={`${item.products?.name || 'Sin producto'} · ${unit} · ${item.area} ha`}
              icon={item.products?.unit_measure === 'kg' ? 'scale' : 'cube'}
              iconColor={item.status === 'active' ? colors.amber : colors.textMuted}
              badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
              right={
                <View style={s.actions}>
                  {rowsEnabledEffective && (
                    <TouchableOpacity style={s.actionBtn} onPress={() => setRowsBlock(item)}>
                      <Ionicons name="reorder-four-outline" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.actionBtn} onPress={() => setFormBlock(item)}>
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
            <ListSkeleton count={4} />
          ) : (
            <EmptyState
              icon="grid-outline"
              title="Sin paños"
              message="Crea el primer paño de este campo con el botón +."
              iconColor={colors.amber}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormBlock('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <BlockFormModal
        target={formBlock}
        fieldId={fieldId}
        products={products || []}
        onClose={() => setFormBlock(null)}
        onSaved={() => {
          setFormBlock(null);
          queryClient.invalidateQueries({ queryKey: ['admin-blocks', fieldId] });
          queryClient.invalidateQueries({ queryKey: ['admin-fields'] });
        }}
      />

      <RowsModal block={rowsBlock} onClose={() => setRowsBlock(null)} />
    </View>
  );
}

/** Modal de gestión de melgas (field_rows) de un paño. */
function RowsModal({ block, onClose }: { block: BlockRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formRow, setFormRow] = useState<any | 'new' | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['admin-field-rows', block?.id],
    enabled: !!block,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_rows')
        .select('id, name, row_number, status')
        .eq('block_id', block!.id)
        .order('row_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (r: any) => {
      const newStatus = r.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('field_rows').update({ status: newStatus }).eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['admin-field-rows', block?.id] });
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'No se pudo actualizar el estado'),
  });

  return (
    <Modal visible={!!block} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Melgas · {block?.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={s.addRowBtn} onPress={() => setFormRow('new')} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={s.addRowText}>Nueva melga</Text>
            </TouchableOpacity>

            {isLoading ? (
              <ListSkeleton count={3} />
            ) : (rows || []).length === 0 ? (
              <Text style={s.noProducts}>No hay melgas en este paño.</Text>
            ) : (
              (rows || []).map((r) => (
                <View key={r.id} style={s.rowLine}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                    {r.row_number != null && (
                      <View style={s.rowNumberBadge}><Text style={s.rowNumberText}>{r.row_number}</Text></View>
                    )}
                    <Text style={[s.rowName, r.status !== 'active' && { color: colors.textMuted }]}>{r.name}</Text>
                    {r.status !== 'active' && <Text style={s.rowInactive}>inactiva</Text>}
                  </View>
                  <View style={s.actions}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => setFormRow(r)}>
                      <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => toggleStatus.mutate(r)}>
                      <Ionicons name={r.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={r.status === 'active' ? colors.red : colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {block && (
        <RowFormModal
          target={formRow}
          blockId={block.id}
          onClose={() => setFormRow(null)}
          onSaved={() => {
            setFormRow(null);
            queryClient.invalidateQueries({ queryKey: ['admin-field-rows', block.id] });
          }}
        />
      )}
    </Modal>
  );
}

/** Form de creación/edición de una melga. */
function RowFormModal({
  target, blockId, onClose, onSaved,
}: {
  target: any | 'new' | null;
  blockId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? target : null;

  const [name, setName] = useState('');
  const [rowNumber, setRowNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setRowNumber(initial?.row_number != null ? String(initial.row_number) : '');
    setErrors({});
  }

  async function handleSubmit() {
    const numParsed = rowNumber.trim() === '' ? null : parseInt(rowNumber, 10);
    const raw = {
      name: name.trim(),
      block_id: blockId,
      row_number: numParsed,
    };
    const parsed = createFieldRowSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') errs[path] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (isEdit && initial) {
        const { error } = await supabase
          .from('field_rows')
          .update({ name: parsed.data.name, row_number: parsed.data.row_number ?? null })
          .eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase.from('field_rows').insert({
          name: parsed.data.name,
          row_number: parsed.data.row_number ?? null,
          block_id: blockId,
        });
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar la melga');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar melga' : 'Nueva melga'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre de la melga" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Melga 1, Hilera 12-A" />
            </Field>
            <Field label="Número de melga (opcional)" error={errors.row_number}>
              <TextField value={rowNumber} onChangeText={setRowNumber} hasError={!!errors.row_number} placeholder="1" keyboardType="number-pad" />
            </Field>
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear melga'} loading={loading} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BlockFormModal({
  target, fieldId, products, onClose, onSaved,
}: {
  target: BlockRow | 'new' | null;
  fieldId: string;
  products: ProductOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as BlockRow) : null;

  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [area, setArea] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setName(initial?.name ?? '');
    setProductId(initial?.product_id ?? '');
    setArea(initial?.area != null ? String(initial.area) : '');
    setErrors({});
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.unit_measure === 'kg' ? 'Kilo' : 'Caja'})`,
  }));

  async function handleSubmit() {
    const areaNum = parseFloat(area);
    const raw = {
      name: name.trim(),
      product_id: productId,
      area: isNaN(areaNum) ? undefined : areaNum,
    };
    const parsed = createBlockSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') errs[path] = issue.message;
      }
      // Mensaje más claro si falta el producto (schema exige uuid).
      if (!productId) errs.product_id = 'Seleccione un producto';
      setErrors(errs);
      return;
    }
    if (!productId) {
      setErrors({ product_id: 'Seleccione un producto' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (isEdit && initial) {
        const { error } = await supabase
          .from('blocks')
          .update({ name: parsed.data.name, product_id: parsed.data.product_id, area: parsed.data.area })
          .eq('id', initial.id);
        if (error) throw error;
      } else {
        // organization_id lo completa el trigger set_organization_id desde el JWT.
        const { error } = await supabase.from('blocks').insert({
          name: parsed.data.name,
          product_id: parsed.data.product_id,
          area: parsed.data.area,
          field_id: fieldId,
        });
        if (error) throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e.message || 'No se pudo guardar el paño');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEdit ? 'Editar paño' : 'Nuevo paño'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre del paño" required error={errors.name}>
              <TextField value={name} onChangeText={setName} hasError={!!errors.name} placeholder="Paño Norte A" />
            </Field>
            <Field label="Producto" required error={errors.product_id}>
              {productOptions.length === 0 ? (
                <Text style={s.noProducts}>No hay productos activos. Créalos primero en Productos.</Text>
              ) : (
                <SelectField value={productId} options={productOptions} onChange={setProductId} hasError={!!errors.product_id} />
              )}
            </Field>
            <Field label="Superficie (ha)" required error={errors.area}>
              <TextField value={area} onChangeText={setArea} hasError={!!errors.area} placeholder="2.5" keyboardType="decimal-pad" />
            </Field>
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear paño'} loading={loading} disabled={productOptions.length === 0} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerCard: {
    backgroundColor: colors.card, marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder,
  },
  headerName: { fontSize: 18, fontWeight: font.bold, color: colors.text },
  headerMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
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
  noProducts: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.primaryMuted, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md },
  addRowText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  rowLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  rowName: { fontSize: 15, fontWeight: font.medium, color: colors.text },
  rowInactive: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  rowNumberBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rowNumberText: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
});
