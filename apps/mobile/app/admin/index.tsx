import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CAPABILITIES, type Capability } from '@fundo360/shared';
import { useAuth } from '../../src/hooks/useAuth';
import { useOrgSettings } from '../../src/hooks/useOrgSettings';
import { useFeatureFlag } from '../../src/hooks/useFeatureFlag';
import { usePermissions } from '../../src/hooks/usePermissions';
import { colors, radius, spacing, font } from '../../src/constants/theme';
import { EmptyState } from '../../src/components/EmptyState';

interface AdminModule {
  key: string;
  route: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  available: boolean;
  requiresCrewMode?: boolean;
  requiresTareFlag?: boolean;
  requiresRbacFlag?: boolean;
  /** Capacidad requerida (RBAC configurable). Si el perfil la restringe, se oculta. */
  requiresCapability?: Capability;
}

/**
 * Menú de Administración (solo rol admin). Punto de entrada a los módulos de
 * gestión de datos maestros que existen en la web. Se implementan por fases;
 * los pendientes se muestran como "Próximamente".
 */
export default function AdminHome() {
  const { worker } = useAuth();
  const { crewModeEnabled } = useOrgSettings();
  const { enabled: tareEnabled } = useFeatureFlag('box_tare_control');
  const { enabled: rbacEnabled } = useFeatureFlag('configurable_rbac');
  const { has } = usePermissions();
  const router = useRouter();

  // Guard de rol: solo el administrador accede a esta sección.
  if (worker && worker.role !== 'admin') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Acceso restringido"
        message="La administración de datos está disponible solo para el rol Administrador."
        iconColor={colors.amber}
      />
    );
  }

  const modules: AdminModule[] = [
    { key: 'workers', route: '/admin/workers', title: 'Trabajadores', description: 'Personal de campo y badges QR', icon: 'people', color: colors.primary, available: true, requiresCapability: CAPABILITIES.WORKERS_MANAGE },
    { key: 'fields', route: '/admin/fields', title: 'Campos y Paños', description: 'Estructura productiva', icon: 'map', color: colors.blue, available: true, requiresCapability: CAPABILITIES.FIELDS_MANAGE },
    { key: 'products', route: '/admin/products', title: 'Productos y Tarifas', description: 'Cultivos y precios por unidad', icon: 'pricetag', color: colors.violet, available: true, requiresCapability: CAPABILITIES.PRODUCTS_MANAGE },
    { key: 'box-types', route: '/admin/box-types', title: 'Tipos de Caja', description: 'Destare y tolerancia de peso', icon: 'cube', color: colors.blue, available: true, requiresTareFlag: true, requiresCapability: CAPABILITIES.BOX_TYPES_MANAGE },
    { key: 'crews', route: '/admin/crews', title: 'Cuadrillas', description: 'Equipos y encargados', icon: 'car', color: colors.amber, available: true, requiresCrewMode: true, requiresCapability: CAPABILITIES.CREWS_MANAGE },
    { key: 'supervisors', route: '/admin/supervisors', title: 'Supervisores', description: 'Asignaciones de trabajadores y paños', icon: 'shield-checkmark', color: colors.orange, available: true, requiresCapability: CAPABILITIES.SUPERVISORS_MANAGE },
    { key: 'permission-profiles', route: '/admin/permission-profiles', title: 'Perfiles de Permisos', description: 'Restringe capacidades por usuario', icon: 'shield-checkmark', color: colors.violet, available: true, requiresRbacFlag: true },
    { key: 'settings', route: '/admin/settings', title: 'Configuración', description: 'Marca, modo capataz, etiquetas', icon: 'settings', color: colors.textSecondary, available: false },
  ];

  const visible = modules.filter(
    (m) =>
      (!m.requiresCrewMode || crewModeEnabled) &&
      (!m.requiresTareFlag || tareEnabled) &&
      (!m.requiresRbacFlag || rbacEnabled) &&
      (!m.requiresCapability || has(m.requiresCapability)),
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.hint}>Gestiona los datos maestros de tu organización.</Text>
      {visible.map((m) => (
        <TouchableOpacity
          key={m.key}
          style={[s.card, !m.available && s.cardDisabled]}
          activeOpacity={m.available ? 0.7 : 1}
          onPress={() => m.available && router.push(m.route as any)}
          disabled={!m.available}
        >
          <View style={[s.icon, { backgroundColor: `${m.color}15` }]}>
            <Ionicons name={m.icon as any} size={22} color={m.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{m.title}</Text>
            <Text style={s.desc}>{m.description}</Text>
          </View>
          {m.available ? (
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          ) : (
            <View style={s.soon}>
              <Text style={s.soonText}>Próximamente</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardDisabled: { opacity: 0.55 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  soon: { backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  soonText: { fontSize: 11, fontWeight: font.medium, color: colors.textMuted },
});
