'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Texto de apoyo bajo el valor (ej. "+3 este mes"). */
  hint?: string;
  /** Tono del acento del ícono. */
  tone?: 'primary' | 'emerald' | 'blue' | 'amber' | 'red';
  /** Índice para escalonar la animación de entrada. */
  index?: number;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, { bg: string; fg: string }> = {
  primary: { bg: 'bg-primary/10', fg: 'text-primary' },
  emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  blue: { bg: 'bg-blue-50', fg: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-600' },
  red: { bg: 'bg-red-50', fg: 'text-red-600' },
};

/**
 * Tarjeta de KPI para la consola de plataforma. Métrica destacada con ícono,
 * al estilo de las tarjetas superiores del panel super-admin.
 */
export function StatCard({ label, value, icon: Icon, hint, tone = 'primary', index = 0 }: StatCardProps) {
  const t = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.bg}`}>
          <Icon size={16} className={t.fg} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}
