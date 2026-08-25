import { View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { localDate } from '../../src/utils/date';
import { formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function ProfileScreen() {
  const { worker, signOut } = useAuth();
  const router = useRouter();
  const roleLabels: Record<string, string> = { admin: 'Administrador', supervisor: 'Supervisor', worker: 'Trabajador' };
  const roleColors: Record<string, string> = { admin: colors.violet, supervisor: colors.blue, worker: colors.primary };

  const { data: detail } = useQuery({
    queryKey: ['worker-detail', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('phone, national_id, created_at').eq('id', worker!.id).single();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['worker-stats', worker?.id, worker?.role],
    enabled: !!worker?.id,
    queryFn: async () => {
      const today = localDate(0);
      const weekAgo = localDate(-7);
      const isManager = worker?.role === 'admin' || worker?.role === 'supervisor';

      if (isManager) {
        // Admin/Supervisor: show team-level stats
        const { data: todayRec } = await supabase.from('picking_records').select('quantity, worker_id').eq('work_day', today).is('original_record_id', null);
        const { data: weekRec } = await supabase.from('picking_records').select('quantity, work_day').gte('work_day', weekAgo).is('original_record_id', null);
        const { data: pendingSettlements } = await supabase.from('settlements').select('id').in('status', ['pending', 'partial']);

        const todayTotal = (todayRec || []).reduce((s, r) => s + Number(r.quantity), 0);
        const todayWorkers = new Set((todayRec || []).map(r => r.worker_id)).size;
        const weekTotal = (weekRec || []).reduce((s, r) => s + Number(r.quantity), 0);

        return {
          isManager: true,
          todayTotal,
          todayWorkers,
          weekTotal,
          pendingCount: (pendingSettlements || []).length,
        };
      }

      // Worker: personal stats
      const { data: todayRec } = await supabase.from('picking_records').select('quantity').eq('worker_id', worker!.id).eq('work_day', today).is('original_record_id', null);
      const { data: weekRec } = await supabase.from('picking_records').select('quantity, work_day').eq('worker_id', worker!.id).gte('work_day', weekAgo).is('original_record_id', null);
      const todayTotal = (todayRec || []).reduce((s, r) => s + Number(r.quantity), 0);
      const weekTotal = (weekRec || []).reduce((s, r) => s + Number(r.quantity), 0);
      const daysWorked = new Set((weekRec || []).map(r => r.work_day)).size;
      return { isManager: false, todayTotal, weekTotal, avgPerDay: daysWorked > 0 ? Math.round(weekTotal / daysWorked) : 0 };
    },
  });

  async function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Cerrar sesión', '¿Desea salir de la aplicación?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
    ]);
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Avatar card */}
      <View style={s.profileCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{worker?.full_name?.charAt(0) || '?'}</Text>
        </View>
        <Text style={s.name}>{worker?.full_name || 'Usuario'}</Text>
        <View style={[s.rolePill, { backgroundColor: (roleColors[worker?.role || ''] || colors.primary) + '15' }]}>
          <View style={[s.roleDot, { backgroundColor: roleColors[worker?.role || ''] || colors.primary }]} />
          <Text style={[s.roleText, { color: roleColors[worker?.role || ''] || colors.primary }]}>{roleLabels[worker?.role || '']}</Text>
        </View>
      </View>

      {/* Stats */}
      {stats && !stats.isManager && (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{formatNumber(stats.todayTotal)}</Text>
            <Text style={s.statLabel}>Hoy</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{formatNumber(stats.weekTotal)}</Text>
            <Text style={s.statLabel}>Semana</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{formatNumber(stats.avgPerDay)}</Text>
            <Text style={s.statLabel}>Prom/día</Text>
          </View>
        </View>
      )}
      {stats && stats.isManager && (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{formatNumber(stats.todayTotal)}</Text>
            <Text style={s.statLabel}>Cajas hoy</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.blue }]}>{stats.todayWorkers}</Text>
            <Text style={s.statLabel}>Activos</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: stats.pendingCount > 0 ? colors.amber : colors.primary }]}>{stats.pendingCount}</Text>
            <Text style={s.statLabel}>Pendientes</Text>
          </View>
        </View>
      )}

      {/* Info */}
      <View style={s.infoCard}>
        <InfoRow label="Estado" value="Activo" icon="checkmark-circle" />
        {detail?.national_id && <InfoRow label="RUT" value={detail.national_id} />}
        {detail?.phone && <InfoRow label="Teléfono" value={detail.phone} />}
        <InfoRow label="Desde" value={detail?.created_at ? new Date(detail.created_at).toLocaleDateString('es-CL') : '—'} last />
      </View>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <Text style={s.version}>Control de Picking v0.1.0</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value, icon, last }: { label: string; value: string; icon?: string; last?: boolean }) {
  return (
    <View style={[ir.row, !last && ir.border]}>
      <Text style={ir.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon && <Ionicons name={icon as any} size={16} color={colors.primary} />}
        <Text style={ir.value}>{value}</Text>
      </View>
    </View>
  );
}

const ir = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.lg },
  border: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  label: { fontSize: 14, color: colors.textSecondary },
  value: { fontSize: 14, fontWeight: font.medium, color: colors.text },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 100 },
  profileCard: { backgroundColor: colors.card, borderRadius: radius.xxl, padding: spacing.xxxl, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  avatar: { width: 72, height: 72, backgroundColor: colors.primaryBg, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText: { fontSize: 28, fontWeight: font.bold, color: colors.primary },
  name: { fontSize: 20, fontWeight: font.bold, color: colors.text, letterSpacing: -0.3 },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, marginTop: 8 },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleText: { fontSize: 12, fontWeight: font.semibold },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  statValue: { fontSize: 22, fontWeight: font.extrabold, color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  infoCard: { backgroundColor: colors.card, borderRadius: radius.xl, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  logoutBtn: { marginTop: spacing.xxl, backgroundColor: colors.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  logoutText: { fontSize: 15, fontWeight: font.semibold, color: colors.red },
  version: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: spacing.lg },
});
