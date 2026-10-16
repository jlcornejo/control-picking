import { AdminGuard } from '../../../src/components/admin/AdminGuard';
import { EmptyState } from '../../../src/components/EmptyState';

/** Stub provisional de detalle de Guía de despacho (G3). Lo reemplaza FEAT-007. */
export default function DispatchGuideDetailScreen() {
  return (
    <AdminGuard>
      <EmptyState
        icon="cube-outline"
        title="Guía de despacho"
        message="En preparación."
      />
    </AdminGuard>
  );
}
