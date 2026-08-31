import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { colors, font, spacing, radius } from '../constants/theme';

/**
 * Banner global de conectividad. Se muestra cuando:
 *  - No hay conexión (modo offline), o
 *  - Hay mutaciones en cola pendientes de sincronizar.
 * Cuando hay red y la cola está vacía no renderiza nada.
 */
export function OfflineBanner() {
  const { pending, syncing, online } = useOfflineSync();
  const insets = useSafeAreaInsets();

  if (online && pending === 0 && !syncing) return null;

  const offline = !online;
  const bg = offline ? colors.amber : colors.blue;
  const icon = offline ? 'cloud-offline-outline' : syncing ? 'sync-outline' : 'cloud-upload-outline';

  let label = '';
  if (offline && pending > 0) {
    label = `Sin conexión · ${pending} ${pending === 1 ? 'registro' : 'registros'} en espera`;
  } else if (offline) {
    label = 'Sin conexión · trabajando offline';
  } else if (syncing) {
    label = `Sincronizando ${pending > 0 ? `${pending} ` : ''}${pending === 1 ? 'registro' : 'registros'}...`;
  } else if (pending > 0) {
    label = `${pending} ${pending === 1 ? 'registro pendiente' : 'registros pendientes'} de sincronizar`;
  }

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 4, backgroundColor: bg }]} pointerEvents="none">
      <Ionicons name={icon as any} size={14} color={colors.textWhite} />
      <Text style={s.text}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: 6,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  text: { color: colors.textWhite, fontSize: 12, fontWeight: font.semibold },
});
