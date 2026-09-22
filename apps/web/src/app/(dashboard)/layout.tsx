import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Sidebar } from '@/components/ui/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: worker } = await supabase
    .from('workers')
    .select('id, full_name, role, must_change_password')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Cambio de contraseña forzado (cuenta creada por el super-admin): antes de
  // permitir el acceso al dashboard, el usuario debe definir su nueva contraseña.
  if (worker?.must_change_password) redirect('/change-password');

  // Un administrador de plataforma no tiene fila en workers: va a su consola.
  if (!worker) {
    const { data: platformAdmin } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (platformAdmin) redirect('/platform');
    // Autenticado pero sin fila en workers ni platform_admins: no pertenece al web.
    redirect('/login');
  }

  // ============================================================
  // Control de acceso al dashboard web por ROL (gating server-side).
  // El dashboard web es de gestión administrativa; los operadores de terreno
  // (supervisor, encargado, trabajador) usan la app móvil.
  //   - admin: acceso total.
  //   - crew_lead (Encargado): SOLO su página "Mi Cuadrilla" (/crew). Cualquier
  //     otra ruta del dashboard lo devuelve a /crew.
  //   - supervisor / worker / otros: sin acceso al web -> a /login.
  // El ocultar links en el Sidebar es cosmético; esta es la barrera real (junto
  // con RLS en la base de datos).
  // ============================================================
  const pathname = (await headers()).get('x-pathname') ?? '';

  if (worker.role === 'crew_lead') {
    // El Encargado solo puede estar dentro de /crew (no /crews, que es del admin).
    if (!pathname.startsWith('/crew') || pathname.startsWith('/crews')) {
      redirect('/crew');
    }
  } else if (worker.role !== 'admin') {
    // supervisor, worker o cualquier otro rol no acceden al dashboard web.
    redirect('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workerName={worker?.full_name || user.email || ''} role={worker?.role || 'worker'} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
