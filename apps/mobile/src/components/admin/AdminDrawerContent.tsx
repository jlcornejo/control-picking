import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CAPABILITIES, type Capability } from '@fundo360/shared';
import { useAuth } from '../../hooks/useAuth';
import { useOrgSettings } from '../../hooks/useOrgSettings';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { usePermissions } from '../../hooks/usePermissions';
import { colors, radius, spacing, font } from '../../constants/theme';

type DrawerSection = 'master' | 'admin';

interface DrawerItem {
  /** Nombre de ruta registrado en el Drawer (coincide con Drawer.Screen name). */
  route: string;
  title: string;
  icon: string;
  color: string;
  section: DrawerSection;
  requiresCrewMode?: boolean;
  requiresTareFlag?: boolean;
  requiresRbacFlag?: boolean;
  requiresDispatchFlag?: boolean;
  /** Capacidad requerida (RBAC configurable). Si el perfil la restringe, se oculta. */
  requiresCapability?: Capability;
}

/**
 * Contenido del Drawer de Administración (solo rol admin). Replica la lógica de
 * visibilidad del menú de administración (admin/index.tsx) y la extiende con los
 * ítems transaccionales, agrupados en dos secciones: "Datos maestros" y
 * "Administración". El gating de UI nunca sustituye RLS/backend.
 */
export function AdminDrawerContent(props: DrawerContentComponentProps) {
  const { worker } = useAuth();
  const { crewModeEnabled } = useOrgSettings();
  const { enabled: tareEnabled } = useFeatureFlag('box_tare_control');
  const { enabled: rbacEnabled } = useFeatureFlag('configurable_rbac');
  const { enabled: dispatchEnabled } = useFeatureFlag('dispatch_guides');
  const { has } = usePermissions();

  // Guard de rol: el drawer solo lista módulos para el administrador.
  if (worker && worker.role !== 'admin') {
    return (
      <DrawerContentScrollView {...props}>
        <View style={s.restricted}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.amber} />
          <Text style={s.restrictedText}>Acceso restringido</Text>
        </View>
      </DrawerContentScrollView>
    );
  }

  const items: DrawerItem[] = [
    // Datos maestros (reuso 1:1 de pantallas existentes).
    { route: 'workers', title: 'Trabajadores', icon: 'people', color: colors.primary, section: 'master', requiresCapability: CAPABILITIES.WORKERS_MANAGE },
    { route: 'fields/index', title: 'Campos y Paños', icon: 'map', color: colors.blue, section: 'master', requiresCapability: CAPABILITIES.FIELDS_MANAGE },
    { route: 'products', title: 'Productos y Tarifas', icon: 'pricetag', color: colors.violet, section: 'master', requiresCapability: CAPABILITIES.PRODUCTS_MANAGE },
    { route: 'box-types', title: 'Tipos de Caja', icon: 'cube', color: colors.blue, section: 'master', requiresTareFlag: true, requiresCapability: CAPABILITIES.BOX_TYPES_MANAGE },
    { route: 'crews', title: 'Cuadrillas', icon: 'car', color: colors.amber, section: 'master', requiresCrewMode: true, requiresCapability: CAPABILITIES.CREWS_MANAGE },
    { route: 'supervisors', title: 'Supervisores', icon: 'shield-checkmark', color: colors.orange, section: 'master', requiresCapability: CAPABILITIES.SUPERVISORS_MANAGE },
    { route: 'permission-profiles', title: 'Perfiles de Permisos', icon: 'shield-checkmark', color: colors.violet, section: 'master', requiresRbacFlag: true },
    // Administración / transaccional (G1, G2, G4, G3).
    { route: 'settings', title: 'Configuración', icon: 'settings', color: colors.textSecondary, section: 'admin', requiresCapability: CAPABILITIES.SETTINGS_MANAGE },
    { route: 'settlements', title: 'Liquidaciones', icon: 'document-text', color: colors.primary, section: 'admin', requiresCapability: CAPABILITIES.SETTLEMENTS_MANAGE },
    { route: 'records', title: 'Registros', icon: 'list', color: colors.blue, section: 'admin' },
    { route: 'dispatch-guides/index', title: 'Guías de despacho', icon: 'cube', color: colors.orange, section: 'admin', requiresDispatchFlag: true },
  ];

  const visible = items.filter(
    (m) =>
      (!m.requiresCrewMode || crewModeEnabled) &&
      (!m.requiresTareFlag || tareEnabled) &&
      (!m.requiresRbacFlag || rbacEnabled) &&
      (!m.requiresDispatchFlag || dispatchEnabled) &&
      (!m.requiresCapability || has(m.requiresCapability)),
  );

  const activeRoute = props.state.routeNames[props.state.index];

  const renderItem = (m: DrawerItem) => {
    const active = m.route === activeRoute;
    return (
      <TouchableOpacity
        key={m.route}
        style={[s.item, active && s.itemActive]}
        activeOpacity={0.7}
        onPress={() => props.navigation.navigate(m.route)}
      >
        <View style={[s.icon, { backgroundColor: `${m.color}15` }]}>
          <Ionicons name={m.icon as never} size={20} color={m.color} />
        </View>
        <Text style={[s.itemText, active && s.itemTextActive]}>{m.title}</Text>
      </TouchableOpacity>
    );
  };

  const masterItems = visible.filter((m) => m.section === 'master');
  const adminItems = visible.filter((m) => m.section === 'admin');

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={s.content}>
      <TouchableOpacity
        style={[s.item, activeRoute === 'index' && s.itemActive]}
        activeOpacity={0.7}
        onPress={() => props.navigation.navigate('index')}
      >
        <View style={[s.icon, { backgroundColor: `${colors.primary}15` }]}>
          <Ionicons name="grid" size={20} color={colors.primary} />
        </View>
        <Text style={[s.itemText, activeRoute === 'index' && s.itemTextActive]}>
          Administración
        </Text>
      </TouchableOpacity>

      {masterItems.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Datos maestros</Text>
          {masterItems.map(renderItem)}
        </View>
      )}

      {adminItems.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Administración</Text>
          {adminItems.map(renderItem)}
        </View>
      )}
    </DrawerContentScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  section: { marginTop: spacing.lg },
  sectionTitle: {
    fontSize: 11,
    fontWeight: font.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  itemActive: { backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 14, fontWeight: font.medium, color: colors.text },
  itemTextActive: { fontWeight: font.semibold, color: colors.primary },
  restricted: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  restrictedText: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
});
