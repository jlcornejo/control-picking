import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { PlatformNav } from '@/components/platform/PlatformNav';

/**
 * Layout de la Consola de Plataforma (super-admin / dueño del SaaS).
 * A diferencia del dashboard de cliente, valida que el usuario esté en
 * platform_admins (no en workers). Un platform_admin no tiene org_id ni
 * fila en workers, por eso tiene su propio espacio separado.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id, full_name, status')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  // Si no es platform admin, no tiene acceso a la consola de plataforma.
  if (!admin) redirect('/dashboard');

  return (
    <div className="flex h-screen overflow-hidden">
      <PlatformNav adminName={admin.full_name || user.email || ''} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-8 pt-16 lg:pt-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
