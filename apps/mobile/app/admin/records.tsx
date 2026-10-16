import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { EmptyState } from '../../src/components/EmptyState';

/** Stub provisional de Registros (G2). Lo reemplaza FEAT-005. */
export default function RecordsScreen() {
  return (
    <AdminGuard>
      <EmptyState
        icon="list-outline"
        title="Registros"
        message="En preparación."
      />
    </AdminGuard>
  );
}
