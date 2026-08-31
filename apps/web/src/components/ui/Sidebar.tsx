'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useBranding } from '@/hooks/useBranding';
import { useOrgSettings } from '@/hooks/useOrgSettings';

interface SidebarProps {
  workerName: string;
  role: string;
}

import {
  LayoutDashboard, MapPin, Package, Users, FileText,
  ClipboardList, Wallet, UserCog, Truck, Settings, Menu, X
} from 'lucide-react';

export function Sidebar({ workerName, role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { branding } = useBranding();
  const { crewModeEnabled, roleLabel: orgRoleLabel } = useOrgSettings();

  // "Cuadrillas" solo se muestra cuando el Modo Capataz está activo en la organización.
  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/fields', label: 'Campos', icon: MapPin },
    { href: '/products', label: 'Productos', icon: Package },
    { href: '/workers', label: 'Trabajadores', icon: Users },
    ...(crewModeEnabled ? [{ href: '/crews', label: orgRoleLabel('crew_lead') + 's', icon: Truck }] : []),
    { href: '/records', label: 'Registros', icon: ClipboardList },
    { href: '/settlements', label: 'Liquidaciones', icon: FileText },
    { href: '/payments', label: 'Pagos', icon: Wallet },
    { href: '/supervisors', label: 'Supervisores', icon: UserCog },
    ...(role === 'crew_lead' ? [{ href: '/crew', label: 'Mi Cuadrilla', icon: Truck }] : []),
    ...(role === 'admin' ? [{ href: '/settings', label: 'Configuración', icon: Settings }] : []),
  ];

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const roleLabel = orgRoleLabel(role as 'admin' | 'supervisor' | 'crew_lead' | 'worker');

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border/50">
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt={branding.name}
            className="h-9 w-9 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package size={18} />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-foreground">{branding.name}</h2>
          <p className="text-[11px] text-muted-foreground">Gestión integral de campo</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navLinks.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname?.startsWith(link.href));
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-primary' : ''} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
            {workerName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{workerName}</p>
            <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-card shadow-md border border-border lg:hidden"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-card shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-muted-foreground">
              <X size={20} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
        {sidebar}
      </aside>
    </>
  );
}
