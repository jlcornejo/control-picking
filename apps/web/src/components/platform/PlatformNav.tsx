'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Building2, ShieldCheck, LogOut } from 'lucide-react';

const links = [
  { href: '/platform', label: 'Organizaciones', icon: Building2 },
];

export function PlatformNav({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="hidden w-64 flex-col border-r border-border/50 bg-white/60 lg:flex">
      <div className="flex items-center gap-3 border-b border-border/50 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Fundo360</h2>
          <p className="text-[11px] text-muted-foreground">Consola de Plataforma</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon size={18} /> {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/50 px-3 py-4">
        <div className="px-3 pb-2">
          <p className="text-sm font-medium text-foreground truncate">{adminName}</p>
          <p className="text-[11px] text-muted-foreground">Administrador de plataforma</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
