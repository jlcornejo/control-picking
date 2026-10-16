import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { colors } from '../../constants/theme';
import { EmptyState } from '../EmptyState';

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Acota el acceso a las pantallas de Administración al rol admin. Si el worker
 * cargado no es admin, muestra "Acceso restringido" (misma copia que el menú de
 * administración). El gating de UI nunca sustituye RLS/backend.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { worker } = useAuth();

  if (worker && worker.role !== 'admin') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Acceso restringido"
        message="La administración de datos está disponible solo para el rol Administrador."
        iconColor={colors.amber}
      />
    );
  }

  return <>{children}</>;
}
