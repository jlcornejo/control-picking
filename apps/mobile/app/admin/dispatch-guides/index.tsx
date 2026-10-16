import { AdminGuard } from '../../../src/components/admin/AdminGuard';
import { EmptyState } from '../../../src/components/EmptyState';

/** Stub provisional de Guías de despacho (G3). Lo reemplaza FEAT-007. */
export default function DispatchGuidesScreen() {
  return (
    <AdminGuard>
      <EmptyState
        icon="cube-outline"
        title="Guías de despacho"
        message="En preparación."
      />
    </AdminGuard>
  );
}
