import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
    setSession(null);
    setWorker(null);
  }

  return { session, worker, loading, signIn, signOut };
}
