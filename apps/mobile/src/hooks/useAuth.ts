import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { primeTenantWorkday, clearTenantWorkdayCache } from '../utils/date';
import type { Session } from '@supabase/supabase-js';

interface WorkerInfo {
  id: string;
  full_name: string;
  role: 'admin' | 'supervisor' | 'crew_lead' | 'worker';
  status: string;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [worker, setWorker] = useState<WorkerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchWorker(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchWorker(session.user.id);
      else { setWorker(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchWorker(userId: string) {
    // Precargar el work_day del tenant (zona horaria de la organización) desde el
    // servidor, para que los filtros de "hoy" no dependan de la zona del dispositivo.
    await primeTenantWorkday();
    const { data } = await supabase
      .from('workers')
      .select('id, full_name, role, status')
      .eq('auth_user_id', userId)
      .single();
    setWorker(data);
    setLoading(false);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    clearTenantWorkdayCache();
    setSession(null);
    setWorker(null);
  }

  return { session, worker, loading, signIn, signOut };
}
