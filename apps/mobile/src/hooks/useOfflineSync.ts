import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectivity } from './useConnectivity';
import { processQueue, subscribeQueue, getQueueCount } from '../lib/offline-queue';

/**
 * Orquesta la sincronización offline:
 *  - Expone la cantidad de mutaciones pendientes en la cola.
 *  - Al recuperar conectividad (o al montar con red), procesa la cola en orden
 *    e invalida las queries afectadas para refrescar la UI.
 */
export function useOfflineSync() {
  const { online } = useConnectivity();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOnline = useRef(online);

  // Mantener el contador en vivo con la cola.
  useEffect(() => {
    const unsub = subscribeQueue(setPending);
    return unsub;
  }, []);

  async function drain() {
    const count = await getQueueCount();
    if (count === 0) return;
    setSyncing(true);
    try {
      const result = await processQueue();
      if (result.processed > 0) {
        // Refrescar todo lo que dependa de las mutaciones reproducidas.
        queryClient.invalidateQueries({ queryKey: ['production'] });
        queryClient.invalidateQueries({ queryKey: ['my-balance'] });
        queryClient.invalidateQueries({ queryKey: ['my-settlements'] });
        queryClient.invalidateQueries({ queryKey: ['crew-member-settlements'] });
      }
    } finally {
      setSyncing(false);
    }
  }

  // Procesar al recuperar conectividad y también al montar si ya hay red.
  useEffect(() => {
    if (online && (!wasOnline.current || pending > 0)) {
      drain();
    }
    wasOnline.current = online;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pending]);

  return { pending, syncing, online, drain };
}
