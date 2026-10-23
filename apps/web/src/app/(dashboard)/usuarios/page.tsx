'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { createLoginUserSchema, updateLoginUserSchema } from '@fundo360/shared';
import { useState } from 'react';
import { KeyRound, Pencil, Ban, CheckCircle2 } from 'lucide-react';

// Roles con login (sin 'worker'). Las etiquetas se aplican por org vía roleLabel.
const ROLE_OPTIONS: { value: 'admin' | 'supervisor' | 'crew_lead' }[] = [
  { value: 'admin' },
  { value: 'supervisor' },
  { value: 'crew_lead' },
];

interface LoginUser {
  id: string;
  full_name: string;
  role: 'admin' | 'supervisor' | 'crew_lead' | 'worker';
  status: string;
  auth_user_id: string | null;
  must_change_password: boolean;
  created_at: string;
}

interface Credentials {
  name: string;
  email?: string;
  password: string;
}

export default function UsuariosPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { roleLabel } = useOrgSettings();

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<LoginUser | null>(null);
  const [toggleUser, setToggleUser] = useState<LoginUser | null>(null);
  const [resetUser, setResetUser] = useState<LoginUser | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['login-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, role, status, auth_user_id, must_change_password, created_at')
        .not('auth_user_id', 'is', null)
        .neq('role', 'worker')
        .order('full_name');
      if (error) throw error;
      return data as LoginUser[];
    },
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['login-users'] });
  }

  async function handleToggle(u: LoginUser) {
    setActionLoading(true);
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const { data, error } = await supabase.functions.invoke(`workers/${u.id}/status`, {
      method: 'PATCH',
      body: { status: newStatus },
    });
    setActionLoading(false);
    if (error || data?.success === false) {
      toast(data?.error?.message || 'No se pudo actualizar el estado', 'error');
      return;
    }
    setToggleUser(null);
    refetch();
    toast('Estado actualizado', 'success');
  }

  async function handleReset(u: LoginUser) {
    setActionLoading(true);
    const { data, error } = await supabase.functions.invoke(`workers/${u.id}/reset-password`, {
      method: 'POST',
    });
    setActionLoading(false);
    if (error || data?.success === false) {
      toast(data?.error?.message || 'No se pudo resetear la contraseña', 'error');
      return;
    }
    setResetUser(null);
    setCredentials({ name: u.full_name, password: data.data.temp_password });
  }

  const columns = [
    { key: 'full_name', label: 'Nombre' },
    { key: 'role', label: 'Rol', render: (row: any) => roleLabel(row.role as 'admin' | 'supervisor' | 'crew_lead') },
    {
      key: 'must_change_password',
      label: 'Acceso',
      render: (row: any) =>
        row.must_change_password ? (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            Debe cambiar contraseña
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Usuarios"
        description="Cuentas de acceso: administradores, supervisores y encargados"
        action={<ActionButton onClick={() => setShowCreate(true)}>+ Nuevo Usuario</ActionButton>}
      />

      <DataTable
        columns={columns}
        data={(data || []) as any[]}
        loading={isLoading}
        emptyMessage="No hay usuarios de acceso registrados"
        searchPlaceholder="Buscar por nombre..."
        searchKeys={['full_name']}
        actions={(row: any) => (
          <>
            <button onClick={() => setEditUser(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <Pencil size={15} />
            </button>
            <button onClick={() => setResetUser(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Resetear contraseña">
              <KeyRound size={15} />
            </button>
            <button onClick={() => setToggleUser(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              {row.status === 'active' ? <Ban size={15} /> : <CheckCircle2 size={15} />}
            </button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Usuario">
        <CreateUserForm
          roleLabel={roleLabel}
          onClose={() => setShowCreate(false)}
          onSuccess={(creds) => { refetch(); setShowCreate(false); setCredentials(creds); }}
        />
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Editar Usuario">
        {editUser && (
          <EditUserForm
            user={editUser}
            roleLabel={roleLabel}
            onSuccess={() => { setEditUser(null); refetch(); toast('Usuario actualizado', 'success'); }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toggleUser}
        onClose={() => setToggleUser(null)}
        onConfirm={() => toggleUser && handleToggle(toggleUser)}
        title={toggleUser?.status === 'active' ? 'Desactivar usuario' : 'Activar usuario'}
        message={`¿Estás seguro de ${toggleUser?.status === 'active' ? 'desactivar' : 'activar'} a ${toggleUser?.full_name}?`}
        confirmLabel={toggleUser?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={toggleUser?.status === 'active' ? 'danger' : 'default'}
        loading={actionLoading}
      />

      <ConfirmDialog
        open={!!resetUser}
        onClose={() => setResetUser(null)}
        onConfirm={() => resetUser && handleReset(resetUser)}
        title="Resetear contraseña"
        message={`¿Resetear la contraseña de ${resetUser?.full_name}? Se generará una temporal que deberá cambiar al ingresar.`}
        confirmLabel="Resetear"
        loading={actionLoading}
      />

      <Modal open={!!credentials} onClose={() => setCredentials(null)} title="Credenciales">
        {credentials && <CredentialView creds={credentials} onClose={() => setCredentials(null)} />}
      </Modal>
    </PageTransition>
  );
}

/** Vista de credenciales (se muestra UNA vez). Replica el patrón de platform/page.tsx. */
function CredentialView({ creds, onClose }: { creds: Credentials; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-800">Contraseña temporal generada</p>
        <p className="text-xs text-emerald-700 mt-1">
          Entrega esta contraseña a <span className="font-medium">{creds.name}</span>. Deberá cambiarla en su primer inicio de sesión.
        </p>
      </div>
      <div className="rounded-xl bg-muted/30 px-4 py-3 space-y-2">
        {creds.email && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-foreground break-all">{creds.email}</p>
          </div>
        )}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contraseña temporal</p>
          <p className="text-sm font-mono text-foreground">{creds.password}</p>
        </div>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
        <p className="text-xs text-amber-800">Esta contraseña no se volverá a mostrar. Cópiala ahora si la necesitas.</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
      >
        Listo
      </button>
    </div>
  );
}

const inputClass =
  'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

function CreateUserForm({
  roleLabel,
  onSuccess,
  onClose,
}: {
  roleLabel: (r: 'admin' | 'supervisor' | 'crew_lead' | 'worker') => string;
  onSuccess: (creds: Credentials) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const raw = {
      full_name: (form.get('full_name') as string).trim(),
      email: (form.get('email') as string).trim(),
      role: form.get('role') as string,
    };

    const parsed = createLoginUserSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Datos inválidos');
      return;
    }

    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke('workers', {
      method: 'POST',
      body: { full_name: parsed.data.full_name, email: parsed.data.email, role: parsed.data.role, create_login: true },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'No se pudo crear el usuario');
      return;
    }

    onSuccess({ name: parsed.data.full_name, email: parsed.data.email, password: data.data.temp_password });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre completo" required>
        <input name="full_name" className={inputClass} placeholder="María Pérez" />
      </FormField>
      <FormField label="Email" required>
        <input name="email" type="email" className={inputClass} placeholder="maria@camposdelsur.cl" autoComplete="off" />
      </FormField>
      <FormField label="Rol" required>
        <select name="role" defaultValue="supervisor" className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{roleLabel(r.value)}</option>
          ))}
        </select>
      </FormField>
      <p className="text-xs text-muted-foreground">
        Se generará una contraseña temporal automáticamente. El usuario deberá cambiarla en su primer acceso.
      </p>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} disabled={loading} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
          {loading ? 'Creando…' : 'Crear Usuario'}
        </button>
      </div>
    </form>
  );
}

function EditUserForm({
  user,
  roleLabel,
  onSuccess,
}: {
  user: LoginUser;
  roleLabel: (r: 'admin' | 'supervisor' | 'crew_lead' | 'worker') => string;
  onSuccess: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const raw = {
      full_name: (form.get('full_name') as string).trim(),
      role: form.get('role') as string,
    };

    const parsed = updateLoginUserSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Datos inválidos');
      return;
    }

    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke(`workers/${user.id}`, {
      method: 'PUT',
      body: { full_name: parsed.data.full_name, role: parsed.data.role },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'No se pudo actualizar el usuario');
      return;
    }

    onSuccess();
  }

  const initialRole = user.role === 'worker' ? 'supervisor' : user.role;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre completo" required>
        <input name="full_name" defaultValue={user.full_name} className={inputClass} />
      </FormField>
      <FormField label="Rol" required>
        <select name="role" defaultValue={initialRole} className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{roleLabel(r.value)}</option>
          ))}
        </select>
      </FormField>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando…' : 'Guardar Cambios'}
      </button>
    </form>
  );
}
