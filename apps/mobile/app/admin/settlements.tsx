import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { EmptyState } from '../../src/components/EmptyState';

/** Stub provisional de Liquidaciones (G1). Lo reemplaza FEAT-004. */
export default function SettlementsScreen() {
  return (
    <AdminGuard>
      <EmptyState
        icon="document-text-outline"
        title="Liquidaciones"
        message="En preparación."
      />
    </AdminGuard>
  );
}
