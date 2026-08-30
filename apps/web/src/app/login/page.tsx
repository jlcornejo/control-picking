'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError('Credenciales inválidas'); setLoading(false); return; }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Aura background */}
      <div className="absolute inset-0 aura-bg bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/20" />

      {/* Animated orbs */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full bg-emerald-200/20 blur-3xl"
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        style={{ top: '10%', left: '10%' }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full bg-teal-200/20 blur-3xl"
        animate={{ x: [0, -30, 20, 0], y: [0, 20, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        style={{ bottom: '10%', right: '10%' }}
      />

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-500/20"
          >
            <span className="text-3xl"><Leaf size={32} className="text-white" /></span>
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Fundo360</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión integral de campo</p>
        </div>

        {/* Glass card */}
        <div className="glass-card rounded-3xl p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email</label>
              <input
                id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="admin@fundo360.cl"
                className="block w-full rounded-xl border border-border/60 bg-white/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">Contraseña</label>
              <input
                id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="block w-full rounded-xl border border-border/60 bg-white/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl bg-red-50/80 border border-red-100 px-4 py-2.5">
                <p className="text-sm text-red-700">{error}</p>
              </motion.div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 hover:from-emerald-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 transition-all duration-200"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
