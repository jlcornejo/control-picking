import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { createLoginUserSchema, updateLoginUserSchema } from '@fundo360/shared';
import { supabase } from '../../src/lib/supabase';
import { useOrgSettings } from '../../src/hooks/useOrgSettings';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Field, TextField, SelectField, SubmitButton, RowItem } from '../../src/components/form/FormControls';
import { AppText, AppTextInput } from '../../src/components/AppText';

type LoginUserRow = {
  id: string;
  full_name: string;
  role: 'admin' | 'supervisor' | 'crew_lead' | 'worker';
  status: string;
  auth_user_id: string | null;
  must_change_password: boolean;
};

type Credentials = { name: string; email?: string; password: string };

// Roles con login (sin 'worker'). Las etiquetas visibles se aplican por org.
const ROLE_OPTIONS = [
  { value: 'crew_lead', label: 'Encargado' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Administrador' },
];

export default function AdminUsersScreen() {
  const { roleLabel } = useOrgSettings();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [formUser, setFormUser] = useState<LoginUserRow | 'new' | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ['admin-login-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, role, status, auth_user_id, must_change_password')
        .not('auth_user_id', 'is', null)
        .neq('role', 'worker')
        .order('full_name');
      if (error) throw error;
      return data as LoginUserRow[];
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filtered = (users || []).filter((u) => {
    if (!search.trim()) return true;
    return u.full_name.toLowerCase().includes(search.toLowerCase());
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-login-users'] });
  }

  async function toggleStatus(u: LoginUserRow) {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const { data, error } = await supabase.functions.invoke(`workers/${u.id}/status`, {
      method: 'PATCH',
      body: { status: newStatus },
    });
    if (error || data?.success === false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('No se pudo actualizar', data?.error?.message || 'Inténtalo de nuevo.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidate();
  }

  function confirmToggle(u: LoginUserRow) {
    const activating = u.status !== 'active';
    Alert.alert(
      activating ? 'Activar usuario' : 'Desactivar usuario',
      `¿${activating ? 'Activar' : 'Desactivar'} a ${u.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activating ? 'Activar' : 'Desactivar', style: activating ? 'default' : 'destructive', onPress: () => toggleStatus(u) },
      ],
    );
  }

  async function resetPassword(u: LoginUserRow) {
    const { data, error } = await supabase.functions.invoke(`workers/${u.id}/reset-password`, {
      method: 'POST',
    });
    if (error || data?.success === false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('No se pudo resetear', data?.error?.message || 'Inténtalo de nuevo.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCredentials({ name: u.full_name, password: data.data.temp_password });
  }

  function confirmReset(u: LoginUserRow) {
    Alert.alert(
      'Resetear contraseña',
      `Se generará una contraseña temporal para ${u.full_name}. Deberá cambiarla al ingresar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Resetear', onPress: () => resetPassword(u) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <AppTextInput
          style={s.searchInput}
          placeholder="Buscar por nombre…"
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
        renderItem={({ item }) => (
          <RowItem
            title={item.full_name}
            subtitle={`${roleLabel(item.role)}${item.must_change_password ? ' · Debe cambiar contraseña' : ''}`}
            icon="shield-checkmark"
            iconColor={item.status === 'active' ? colors.violet : colors.textMuted}
            badge={{ label: item.status === 'active' ? 'Activo' : 'Inactivo', color: item.status === 'active' ? colors.primary : colors.textMuted }}
            right={
              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => setFormUser(item)}>
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => confirmReset(item)}>
                  <Ionicons name="key-outline" size={18} color={colors.blue} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => confirmToggle(item)}>
                  <Ionicons name={item.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={item.status === 'active' ? colors.red : colors.primary} />
                </TouchableOpacity>
              </View>
            }
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton count={5} />
          ) : (
            <EmptyState
              icon="people-outline"
              title={search ? 'Sin resultados' : 'Sin usuarios'}
              message={search ? 'Prueba con otro término de búsqueda.' : 'Crea el primer usuario de acceso con el botón +.'}
              iconColor={colors.violet}
            />
          )
        }
      />

      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={() => setFormUser('new')}>
        <Ionicons name="add" size={28} color={colors.textWhite} />
      </TouchableOpacity>

      <UserFormModal
        target={formUser}
        onClose={() => setFormUser(null)}
        onSaved={() => { setFormUser(null); invalidate(); }}
        onCreated={(creds) => { setFormUser(null); invalidate(); setCredentials(creds); }}
      />

      <CredentialModal credentials={credentials} onClose={() => setCredentials(null)} />
    </View>
  );
}

function UserFormModal({
  target, onClose, onSaved, onCreated,
}: {
  target: LoginUserRow | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
  onCreated: (creds: Credentials) => void;
}) {
  const isEdit = target && target !== 'new';
  const initial = isEdit ? (target as LoginUserRow) : null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('supervisor');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Reinicia el formulario cada vez que cambia el target.
  const key = target === 'new' ? 'new' : initial?.id ?? 'none';
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (target && key !== lastKey) {
    setLastKey(key);
    setFullName(initial?.full_name ?? '');
    setEmail('');
    setRole(initial?.role && ROLE_OPTIONS.some((r) => r.value === initial.role) ? initial.role : 'supervisor');
    setErrors({});
  }

  async function handleSubmit() {
    setErrors({});
    if (isEdit && initial) {
      const parsed = updateLoginUserSchema.safeParse({ full_name: fullName.trim(), role });
      if (!parsed.success) {
        setErrors(collectErrors(parsed.error.issues));
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.functions.invoke(`workers/${initial.id}`, {
        method: 'PUT',
        body: { full_name: parsed.data.full_name, role: parsed.data.role },
      });
      setLoading(false);
      if (error || data?.success === false) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', data?.error?.message || 'No se pudo actualizar el usuario');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } else {
      const parsed = createLoginUserSchema.safeParse({ full_name: fullName.trim(), email: email.trim(), role });
      if (!parsed.success) {
        setErrors(collectErrors(parsed.error.issues));
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('workers', {
        method: 'POST',
        body: { full_name: parsed.data.full_name, email: parsed.data.email, role: parsed.data.role, create_login: true },
      });
      setLoading(false);
      if (error || data?.success === false) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', data?.error?.message || 'No se pudo crear el usuario');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated({ name: parsed.data.full_name, email: parsed.data.email, password: data.data.temp_password });
    }
  }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <AppText style={s.sheetTitle}>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</AppText>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Field label="Nombre completo" required error={errors.full_name}>
              <TextField value={fullName} onChangeText={setFullName} hasError={!!errors.full_name} placeholder="María Pérez" />
            </Field>
            {!isEdit && (
              <Field label="Email" required error={errors.email}>
                <TextField
                  value={email}
                  onChangeText={setEmail}
                  hasError={!!errors.email}
                  placeholder="maria@camposdelsur.cl"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </Field>
            )}
            <Field label="Rol" required error={errors.role}>
              <SelectField value={role} options={ROLE_OPTIONS} onChange={setRole} hasError={!!errors.role} />
            </Field>
            {!isEdit && (
              <AppText style={s.hint}>
                Se generará una contraseña temporal automáticamente. El usuario deberá cambiarla al ingresar.
              </AppText>
            )}
            <SubmitButton label={isEdit ? 'Guardar cambios' : 'Crear usuario'} loading={loading} onPress={handleSubmit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CredentialModal({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!credentials) return;
    await Clipboard.setStringAsync(credentials.password);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal visible={!!credentials} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.credBackdrop}>
        <View style={s.credCard}>
          <AppText style={s.credTitle}>Contraseña temporal</AppText>
          <AppText style={s.credHint}>
            Entrega esta contraseña al usuario; deberá cambiarla al ingresar. No se volverá a mostrar.
          </AppText>
          {credentials?.email ? (
            <View style={s.credBox}>
              <AppText style={s.credLabel}>Email</AppText>
              <AppText style={s.credMono}>{credentials.email}</AppText>
            </View>
          ) : null}
          <View style={s.credBox}>
            <AppText style={s.credLabel}>Contraseña</AppText>
            <AppText style={s.credMono}>{credentials?.password}</AppText>
          </View>
          <TouchableOpacity style={s.copyBtn} onPress={copy} activeOpacity={0.85}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.primary} />
            <AppText style={s.copyText}>{copied ? 'Copiado' : 'Copiar'}</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={s.credDone} onPress={onClose} activeOpacity={0.85}>
            <AppText style={s.credDoneText}>Listo</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function collectErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path[0];
    if (typeof path === 'string') errs[path] = issue.message;
  }
  return errs;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: { padding: 6, borderRadius: radius.sm },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  sheetTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  credBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  credCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 360 },
  credTitle: { fontSize: 18, fontWeight: font.bold, color: colors.text },
  credHint: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.lg },
  credBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  credLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  credMono: { fontSize: 15, color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  copyText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  credDone: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  credDoneText: { fontSize: 15, fontWeight: font.semibold, color: colors.textWhite },
});
