import { AdminGuard } from '../../src/components/admin/AdminGuard';
import { EmptyState } from '../../src/components/EmptyState';

/** Stub provisional de Configuración (G4). Lo reemplaza FEAT-003. */
export default function SettingsScreen() {
  return (
    <AdminGuard>
      <EmptyState
        icon="settings-outline"
        title="Configuración"
        message="En preparación."
      />
    </AdminGuard>
  );
}
