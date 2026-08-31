import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { colors, font, radius } from '../../src/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function TabsLayout() {
  const { worker } = useAuth();
  // Operadores de terreno (registran producción y ven dashboard): admin, supervisor y encargado.
  const isAdmin = worker?.role === 'admin' || worker?.role === 'supervisor' || worker?.role === 'crew_lead';

  const { data: recentPayments } = useQuery({
    queryKey: ['recent-payments-badge', worker?.id],
    enabled: !!worker?.id && worker?.role === 'worker',
    queryFn: async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data } = await supabase
        .from('payments')
        .select('id')
        .eq('worker_id', worker!.id)
        .gte('paid_at', weekAgo.toISOString());
      return data?.length || 0;
    },
    refetchInterval: 60000,
  });

  const paymentBadge = recentPayments && recentPayments > 0 ? recentPayments : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card, elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: font.bold, fontSize: 17 },
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 24 : 14,
          left: 20,
          right: 20,
          height: 68,
          backgroundColor: colors.card,
          borderRadius: 22,
          borderTopWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 10,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarItemStyle: { paddingTop: 10, paddingBottom: 8 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: font.semibold },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />

      <Tabs.Screen
        name="metrics"
        options={{
          title: 'Dashboard',
          headerTitle: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center', justifyContent: 'center', height: 24, marginTop: 2 }}>
              <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={21} color={color} />
            </View>
          ),
          href: isAdmin ? '/(tabs)/metrics' : null,
        }}
      />

      <Tabs.Screen
        name="production"
        options={{
          title: isAdmin ? 'Producción' : 'Mi Día',
          headerTitle: isAdmin ? 'Producción' : 'Mi Producción',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'leaf' : 'leaf-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="register"
        options={{
          title: '',
          headerTitle: 'Registro Picking',
          tabBarIcon: ({ focused }) => (
            <View style={[s.centerBtn, focused && s.centerBtnActive]}>
              <Ionicons name="qr-code" size={24} color="#fff" />
            </View>
          ),
          tabBarItemStyle: { paddingTop: 0, paddingBottom: 0 },
          href: isAdmin ? '/(tabs)/register' : null,
        }}
      />

      <Tabs.Screen
        name="payments"
        options={{
          title: 'Pagos',
          headerTitle: isAdmin ? 'Liquidaciones' : 'Mis Pagos',
          tabBarBadge: paymentBadge,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 9, minWidth: 16, height: 16, borderRadius: 8, lineHeight: 15 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="crew"
        options={{
          title: 'Mi Cuadrilla',
          headerTitle: 'Mi Cuadrilla',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
          // Solo el Encargado ve "Mi Cuadrilla".
          href: worker?.role === 'crew_lead' ? '/(tabs)/crew' : null,
        }}
      />

      <Tabs.Screen
        name="team"
        options={{
          title: 'Mi Equipo',
          headerTitle: 'Mi Equipo',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people-circle' : 'people-circle-outline'} size={22} color={color} />
          ),
          // Solo el Supervisor ve "Mi Equipo".
          href: worker?.role === 'supervisor' ? '/(tabs)/team' : null,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          headerTitle: 'Mi Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  centerBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  centerBtnActive: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 1.05 }],
  },
});
