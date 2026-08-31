import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet, Platform, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useOrgSettings } from '../../src/hooks/useOrgSettings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import { localDate } from '../../src/utils/date';
import { formatNumber } from '../../src/utils/format';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';

type Period = 'today' | 'week' | 'month';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

const QR_SIZE = Math.min(Dimensions.get('window').width * 0.55, 220);

export default function ProfileScreen() {
  const { worker, signOut } = useAuth();
  const { roleLabel } = useOrgSettings();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('today');
  const [showQR, setShowQR] = useState(false);
  // Etiqueta configurable por organización (incluye Encargado). Fallback en el hook.
  const roleText = worker?.role ? roleLabel(worker.role) : '';
  const roleColors: Record<string, string> = { admin: colors.violet, supervisor: colors.blue, crew_lead: colors.amber, worker: colors.primary };

  const { data: detail } = useQuery({
    queryKey: ['worker-detail', worker?.id],
    enabled: !!worker?.id,
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('phone, national_id, created_at, qr_badge_url').eq('id', worker!.id).single();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['worker-stats', worker?.id, worker?.role, selectedPeriod],
    enabled: !!worker?.id,
    queryFn: async () => {
      const today = localDate(0);
      const periodOffset = selectedPeriod === 'today' ? 0 : selectedPeriod === 'week' ? -7 : -30;
      const fromDate = selectedPeriod === 'today' ? today : localDate(periodOffset);
      const isManager = worker?.role === 'admin' || worker?.role === 'supervisor';

      if (isManager) {
        let query = supabase.from('picking_records').select('quantity, worker_id, work_day').is('original_record_id', null);
        if (selectedPeriod === 'today') {
          query = query.eq('work_day', today);
        } else {
          query = query.gte('work_day', fromDate).lte('work_day', today);
        }
        const { data: records } = await query;
        const { data: pendingSettlements } = await supabase.from('settlements').select('id').in('status', ['pending', 'partial']);

        const totalUnits = (records || []).reduce((s, r) => s + Number(r.quantity), 0);
        const activeWorkers = new Set((records || []).map(r => r.worker_id)).size;
        const daysWorked = new Set((records || []).map(r => r.work_day)).size;
        const avgPerDay = daysWorked > 0 ? Math.round(totalUnits / daysWorked) : 0;

        return {
          isManager: true,
          totalUnits,
          activeWorkers,
          daysWorked,
          avgPerDay,
          pendingCount: (pendingSettlements || []).length,
        };
      }

      // Worker: personal stats
      let query = supabase.from('picking_records').select('quantity, work_day').eq('worker_id', worker!.id).is('original_record_id', null);
      if (selectedPeriod === 'today') {
        query = query.eq('work_day', today);
      } else {
        query = query.gte('work_day', fromDate).lte('work_day', today);
      }
      const { data: records } = await query;
      const totalUnits = (records || []).reduce((s, r) => s + Number(r.quantity), 0);
      const daysWorked = new Set((records || []).map(r => r.work_day)).size;
      const avgPerDay = daysWorked > 0 ? Math.round(totalUnits / daysWorked) : 0;
      return { isManager: false, totalUnits, daysWorked, avgPerDay };
    },
  });

  function handleLogout() {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    if (Platform.OS === 'web') {
      const confirmed = (globalThis as unknown as { confirm: (msg: string) => boolean }).confirm('¿Desea salir de la aplicación?');
      if (confirmed) {
        signOut().then(() => router.replace('/login'));
      }
      return;
    }

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
          <Text style={[s.roleText, { color: roleColors[worker?.role || ''] || colors.primary }]}>{roleText}</Text>
        </View>
      </View>

      {/* Period chips + Stats */}
      {stats && (
        <>
          <View style={s.periodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[s.periodChip, selectedPeriod === p.key && s.periodChipActive]}
                onPress={() => setSelectedPeriod(p.key)}
                activeOpacity={0.7}
              >
                <Text style={[s.periodChipText, selectedPeriod === p.key && s.periodChipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {stats.isManager ? (
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statValue}>{formatNumber(stats.totalUnits)}</Text>
                <Text style={s.statLabel}>Cajas</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statValue, { color: colors.blue }]}>{stats.activeWorkers}</Text>
                <Text style={s.statLabel}>Trabajadores</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statValue}>{formatNumber(stats.avgPerDay)}</Text>
                <Text style={s.statLabel}>Prom/día</Text>
              </View>
            </View>
          ) : (
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statValue}>{formatNumber(stats.totalUnits)}</Text>
                <Text style={s.statLabel}>Cajas</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statValue, { color: colors.blue }]}>{stats.daysWorked}</Text>
                <Text style={s.statLabel}>Días</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statValue}>{formatNumber(stats.avgPerDay)}</Text>
                <Text style={s.statLabel}>Prom/día</Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* Info */}
      <View style={s.infoCard}>
        <InfoRow label="Estado" value="Activo" icon="checkmark-circle" />
        {detail?.national_id && <InfoRow label="RUT" value={detail.national_id} />}
        {detail?.phone && <InfoRow label="Teléfono" value={detail.phone} />}
        <InfoRow label="Desde" value={detail?.created_at ? new Date(detail.created_at).toLocaleDateString('es-CL') : '—'} last />
      </View>

      {/* QR Badge Button - only for workers */}
      {worker?.role === 'worker' && detail?.qr_badge_url && (
        <TouchableOpacity style={s.qrBtn} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} setShowQR(true); }} activeOpacity={0.8}>
          <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
          <Text style={s.qrBtnText}>Mi Badge QR</Text>
        </TouchableOpacity>
      )}

      {/* QR Modal */}
      <Modal visible={showQR} animationType="fade" transparent statusBarTranslucent>
        <View style={s.qrOverlay}>
          <View style={s.qrCard}>
            <Text style={s.qrTitle}>Mi Badge QR</Text>
            <Text style={s.qrSubtitle}>{worker?.full_name}</Text>
            <View style={s.qrContainer}>
              <QRCode value={detail?.qr_badge_url || ''} size={QR_SIZE} backgroundColor="#fff" color={colors.text} />
            </View>
            <Text style={s.qrHint}>Presenta este código al supervisor para registrar tu producción</Text>
            <TouchableOpacity style={s.qrCloseBtn} onPress={() => setShowQR(false)} activeOpacity={0.8}>
              <Text style={s.qrCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <Text style={s.version}>Fundo360 v0.1.0</Text>
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
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xs },
  periodChip: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center' },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { fontSize: 12, fontWeight: font.semibold, color: colors.textSecondary },
  periodChipTextActive: { color: '#fff' },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  statValue: { fontSize: 22, fontWeight: font.extrabold, color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  infoCard: { backgroundColor: colors.card, borderRadius: radius.xl, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  logoutBtn: { marginTop: spacing.xxl, backgroundColor: colors.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  logoutText: { fontSize: 15, fontWeight: font.semibold, color: colors.red },
  version: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: spacing.lg },
  qrBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: spacing.lg, backgroundColor: colors.primaryBg, borderWidth: 1, borderColor: colors.primaryMuted, borderRadius: radius.lg, paddingVertical: 16 },
  qrBtnText: { fontSize: 15, fontWeight: font.semibold, color: colors.primary },
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  qrCard: { backgroundColor: '#fff', borderRadius: radius.xxl, padding: spacing.xxxl, alignItems: 'center', width: '100%', maxWidth: 340 },
  qrTitle: { fontSize: 18, fontWeight: font.bold, color: colors.text, marginBottom: 4 },
  qrSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xl },
  qrContainer: { padding: spacing.lg, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder },
  qrHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, lineHeight: 18, paddingHorizontal: spacing.md },
  qrCloseBtn: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 40 },
  qrCloseBtnText: { fontSize: 15, fontWeight: font.semibold, color: colors.textSecondary },
});
