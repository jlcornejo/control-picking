import { Stack } from 'expo-router';
import { colors, font } from '../../src/constants/theme';

/**
 * Sección de Administración (solo rol admin). Stack apilado sobre los tabs,
 * accesible desde Perfil. Cada módulo (trabajadores, campos, productos,
 * cuadrillas, etc.) es una pantalla dentro de este stack.
 */
export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: font.bold, fontSize: 17 },
        headerBackTitle: 'Atrás',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Administración' }} />
      <Stack.Screen name="workers" options={{ title: 'Trabajadores' }} />
      <Stack.Screen name="fields/index" options={{ title: 'Campos' }} />
      <Stack.Screen name="fields/[id]" options={{ title: 'Campo' }} />
      <Stack.Screen name="products" options={{ title: 'Productos y Tarifas' }} />
      <Stack.Screen name="crews" options={{ title: 'Cuadrillas' }} />
      <Stack.Screen name="supervisors" options={{ title: 'Supervisores' }} />
    </Stack>
  );
}
