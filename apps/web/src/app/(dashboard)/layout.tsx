import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/ui/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: worker } = await supabase
    .from('workers')
    .select('id, full_name, role')
    .eq('auth_user_id', user.id)
    .single();

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
