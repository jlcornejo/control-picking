import { Drawer } from 'expo-router/drawer';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { AdminDrawerContent } from '../../src/components/admin/AdminDrawerContent';
import { colors, font } from '../../src/constants/theme';

/**
 * Sección de Administración (solo rol admin). Drawer híbrido montado sobre los
 * tabs, accesible desde el botón hamburguesa del header. Las rutas de detalle
 * (fields/[id], dispatch-guides/[id]) se ocultan del listado del drawer; el
 * orden/encabezados y el gating por capability/flag los controla
 * AdminDrawerContent.
 */
export default function AdminLayout() {
  return (
    <Drawer
      drawerContent={(props: DrawerContentComponentProps) => <AdminDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: font.bold, fontSize: 17 },
        drawerType: 'front',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Datos maestros (reuso 1:1 de pantallas existentes) */}
      <Drawer.Screen name="index" options={{ title: 'Administración' }} />
      <Drawer.Screen name="workers" options={{ title: 'Trabajadores' }} />
      <Drawer.Screen name="fields/index" options={{ title: 'Campos' }} />
      <Drawer.Screen name="fields/[id]" options={{ title: 'Campo', drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="products" options={{ title: 'Productos y Tarifas' }} />
      <Drawer.Screen name="box-types" options={{ title: 'Tipos de Caja' }} />
      <Drawer.Screen name="crews" options={{ title: 'Cuadrillas' }} />
      <Drawer.Screen name="supervisors" options={{ title: 'Supervisores' }} />
      <Drawer.Screen name="users" options={{ title: 'Usuarios' }} />
      <Drawer.Screen name="permission-profiles" options={{ title: 'Perfiles de Permisos' }} />
      {/* Administración / transaccional (G1, G2, G4, G3) */}
      <Drawer.Screen name="settings" options={{ title: 'Configuración' }} />
      <Drawer.Screen name="settlements" options={{ title: 'Liquidaciones' }} />
      <Drawer.Screen name="records" options={{ title: 'Registros' }} />
      <Drawer.Screen name="dispatch-guides/index" options={{ title: 'Guías de despacho' }} />
      <Drawer.Screen name="dispatch-guides/[id]" options={{ title: 'Guía', drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}
