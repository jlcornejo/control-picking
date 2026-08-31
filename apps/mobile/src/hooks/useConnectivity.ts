import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Estado de conectividad de red. `online` es true solo cuando hay conexión
 * y (cuando el dato está disponible) acceso real a internet.
 */
export type Connectivity = {
  online: boolean;
  type: string | null;
};

function isOnline(state: NetInfoState): boolean {
  // isInternetReachable puede ser null mientras se resuelve; en ese caso
  // nos guiamos por isConnected para no marcar offline de forma agresiva.
  if (state.isInternetReachable === false) return false;
  return !!state.isConnected;
}

export function useConnectivity(): Connectivity {
  const [state, setState] = useState<Connectivity>({ online: true, type: null });

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((s) => {
      if (mounted) setState({ online: isOnline(s), type: s.type });
    });
    const unsub = NetInfo.addEventListener((s) => {
      setState({ online: isOnline(s), type: s.type });
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return state;
}
