'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Cambio de contraseña forzado en el primer inicio de sesión.
 * El admin de un cliente recién creado por el super-admin llega aquí antes de
 * poder entrar al dashboard. Al completar, el backend limpia must_change_password.
 */
export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: fnErr } = await supabase.functions.invoke('auth/change-password', {
      method: 'POST',
      body: { new_password: newPassword },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'No se pudo actualizar la contraseña');
      return;
    }

    // Contraseña cambiada: entrar al dashboard.
    router.push('/dashboard');
    router.refresh();
  }

  const inputClass =
    'block w-full rounded-xl border border-border/60 bg-white/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 aura-bg bg-gradient-to-br from-background via-primary/5 to-glow/5" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-glow shadow-lg shadow-primary/20">
            <KeyRound size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Cambia tu contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Por seguridad, define una nueva contraseña antes de continuar.
          </p>
        </div>

        <div className="glass-card rounded-3xl p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="new" className="block text-sm font-medium text-foreground mb-2">Nueva contraseña</label>
              <input
                id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
                placeholder="Mínimo 8 caracteres" autoComplete="new-password" className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-2">Confirmar contraseña</label>
              <input
                id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                placeholder="Repite la contraseña" autoComplete="new-password" className={inputClass}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50/80 border border-red-100 px-4 py-2.5">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 transition-all duration-200"
            >
              {loading ? 'Guardando...' : 'Guardar y continuar'}
            </button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
